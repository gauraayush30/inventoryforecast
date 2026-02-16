from fastapi import FastAPI, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import pandas as pd
from datetime import date, timedelta

from db import get_all_skus, get_history as db_get_history, get_current_stock, record_transaction

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models for request validation ──────────────────
class TransactionRequest(BaseModel):
    """Request body for recording a sales/purchase transaction."""
    sku_id: str = Field(..., description="Stock Keeping Unit ID")
    sales_qty: int = Field(default=0, ge=0, description="Quantity sold")
    purchase_qty: int = Field(default=0, ge=0, description="Quantity purchased")
    transaction_date: str = Field(default_factory=lambda: str(date.today()), description="Transaction date (YYYY-MM-DD)")

    class Config:
        schema_extra = {
            "example": {
                "sku_id": "SKU001",
                "sales_qty": 5,
                "purchase_qty": 10,
                "transaction_date": "2026-02-14"
            }
        }

# ── Load per-SKU ML models ───────────────────────────────────
models = joblib.load("../backend/models.pkl")

FEATURES = [
    "day_of_week", "month", "day_of_month",
    "day_of_year", "is_weekend", "week_of_year",
]


@app.get("/")
def home():
    return {"message": "Inventory Forecast API Running"}


# ── List all SKUs (from DB) ──────────────────────────────────
@app.get("/skus")
def skus():
    return {"skus": get_all_skus()}


# ── Historical sales (from DB) ──────────────────────────────
@app.get("/history")
def history(sku_id: str = Query(...), days: int = Query(7)):
    rows = db_get_history(sku_id, days)
    return {"sku_id": sku_id, "days": days, "history": rows}


# ── Forecast (ML model) ─────────────────────────────────────
@app.get("/forecast")
def forecast(sku_id: str = Query(...), days: int = Query(7)):
    if sku_id not in models:
        return {"error": f"No model found for {sku_id}"}

    model = models[sku_id]
    today = date.today()

    future_dates = [today + timedelta(days=i) for i in range(1, days + 1)]
    rows = []
    for d in future_dates:
        rows.append({
            "day_of_week":  d.weekday(),
            "month":        d.month,
            "day_of_month": d.day,
            "day_of_year":  d.timetuple().tm_yday,
            "is_weekend":   1 if d.weekday() >= 5 else 0,
            "week_of_year": d.isocalendar()[1],
        })

    X_future = pd.DataFrame(rows)[FEATURES]
    predictions = model.predict(X_future)

    result = []
    total_demand = 0
    for i, d in enumerate(future_dates):
        sales = max(0, round(float(predictions[i]), 2))
        total_demand += sales
        result.append({
            "date": d.strftime("%Y-%m-%d"),
            "predicted_sales": sales,
        })

    current_stock = get_current_stock(sku_id)
    if current_stock < total_demand:
        stock_status = "REORDER NOW"
    elif current_stock < total_demand * 1.2:
        stock_status = "LOW STOCK"
    else:
        stock_status = "STOCK OK"

    return {
        "sku_id": sku_id,
        "current_stock": current_stock,
        "total_forecast_demand": round(total_demand, 2),
        "stock_status": stock_status,
        "forecast": result,
    }


# ── Record a transaction (sales/purchase) ──────────────────
@app.post("/record-transaction", status_code=status.HTTP_201_CREATED)
def record_sale_purchase(transaction: TransactionRequest):
    """
    Record a sales or purchase transaction for an SKU.
    
    Updates inventory stock level based on sales and purchases.
    Returns the transaction details and updated stock information.
    
    Parameters:
    - sku_id: Stock Keeping Unit ID
    - sales_qty: Quantity sold (reduces inventory)
    - purchase_qty: Quantity purchased (increases inventory)
    - transaction_date: Date of transaction (default: today)
    """
    try:
        # Validate that at least one operation is being performed
        if transaction.sales_qty == 0 and transaction.purchase_qty == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either sales_qty or purchase_qty must be greater than 0"
            )
        
        result = record_transaction(
            sku_id=transaction.sku_id,
            sales_qty=transaction.sales_qty,
            purchase_qty=transaction.purchase_qty,
            transaction_date=transaction.transaction_date
        )
        return result
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error recording transaction: {str(e)}"
        )
