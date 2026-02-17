print("THIS FILE IS RUNNING")

from fastapi import FastAPI, Query, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import joblib
import pandas as pd
from datetime import date, timedelta

from db import (
    get_all_skus,
    get_history as db_get_history,
    get_current_stock,
    record_transaction,
    get_replenishment_settings,
    set_replenishment_settings,
)
from replenishment import ReplenishmentRecommendationEngine

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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



# REPLENISHMENT MODELS - Pydantic models for replenishment feature


class ReplenishmentSettings(BaseModel):
    """Replenishment settings for a SKU."""
    sku_id: str = Field(..., description="Stock Keeping Unit ID")
    lead_time_days: int = Field(..., ge=1, description="Days until supplier delivers order")
    min_order_qty: int = Field(..., ge=1, description="Minimum order quantity from supplier")
    reorder_point: int = Field(..., ge=0, description="Stock level that triggers reorder")
    safety_stock: int = Field(..., ge=0, description="Minimum buffer stock to maintain")
    target_stock_level: int = Field(..., ge=0, description="Desired inventory level")

    class Config:
        schema_extra = {
            "example": {
                "sku_id": "SKU001",
                "lead_time_days": 7,
                "min_order_qty": 10,
                "reorder_point": 50,
                "safety_stock": 25,
                "target_stock_level": 150,
            }
        }


class ReplenishmentSettingsUpdate(BaseModel):
    """Request body for updating replenishment settings."""
    lead_time_days: int = Field(..., ge=1, description="Days until supplier delivers order")
    min_order_qty: int = Field(..., ge=1, description="Minimum order quantity from supplier")
    reorder_point: int = Field(..., ge=0, description="Stock level that triggers reorder")
    safety_stock: int = Field(..., ge=0, description="Minimum buffer stock to maintain")
    target_stock_level: int = Field(..., ge=0, description="Desired inventory level")

    class Config:
        schema_extra = {
            "example": {
                "lead_time_days": 7,
                "min_order_qty": 10,
                "reorder_point": 50,
                "safety_stock": 25,
                "target_stock_level": 150,
            }
        }


class ReplenishmentRecommendation(BaseModel):
    """Response model for replenishment recommendation."""
    sku_id: str
    reorder_needed: bool
    order_quantity: int
    urgency: str  # CRITICAL, HIGH, MEDIUM, LOW
    projected_stock_at_lead_time: int
    current_stock: int
    demand_during_lead_time: float
    reorder_point: int
    safety_stock: int
    target_stock_level: int
    suggested_order_date: str = None
    expected_arrival_date: str = None
    message: str


models = joblib.load("../backend/models.pkl")

FEATURES = [
    "day_of_week", "month", "day_of_month",
    "day_of_year", "is_weekend", "week_of_year",
]


@app.get("/")
def home():
    return {"message": "Inventory Forecast API Running"}


@app.get("/skus")
def skus():
    return {"skus": get_all_skus()}


@app.get("/history")
def history(sku_id: str = Query(...), days: int = Query(7)):
    rows = db_get_history(sku_id, days)
    current_stock = get_current_stock(sku_id)
    return {"sku_id": sku_id, "days": days, "history": rows, "current_stock": current_stock}


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


# ============================================================================
# REPLENISHMENT ENDPOINTS - NEW functionality for stock replenishment recommendations
# ============================================================================

@app.get("/replenishment-settings/{sku_id}")
def get_replenishment_settings_endpoint(sku_id: str):
    """
    Get replenishment settings for a SKU.
    
    Returns custom settings if configured, otherwise returns sensible defaults.
    
    Parameters:
    - sku_id: Stock Keeping Unit ID
    """
    try:
        settings = get_replenishment_settings(sku_id)
        return settings
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error retrieving replenishment settings: {str(e)}"
        )


@app.post("/replenishment-settings/{sku_id}", status_code=status.HTTP_201_CREATED)
def set_replenishment_settings_endpoint(sku_id: str, settings: ReplenishmentSettingsUpdate):
    """
    Set or update replenishment settings for a SKU.
    
    Parameters:
    - sku_id: Stock Keeping Unit ID
    - settings: Replenishment settings (lead_time_days, min_order_qty, reorder_point, safety_stock, target_stock_level)
    """
    try:
        settings_dict = {
            "lead_time_days": settings.lead_time_days,
            "min_order_qty": settings.min_order_qty,
            "reorder_point": settings.reorder_point,
            "safety_stock": settings.safety_stock,
            "target_stock_level": settings.target_stock_level,
        }
        result = set_replenishment_settings(sku_id, settings_dict)
        return result
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error saving replenishment settings: {str(e)}"
        )


@app.get("/replenishment-recommendation", response_model=ReplenishmentRecommendation)
def replenishment_recommendation(sku_id: str = Query(...), days: int = Query(14)):
    """
    Generate a stock replenishment recommendation for a SKU.
    
    Analyzes current stock and forecasted demand to recommend when and how much to order.
    Takes into account supplier lead time to ensure stock availability.
    
    Parameters:
    - sku_id: Stock Keeping Unit ID
    - days: Number of days to forecast (default: 14, should be >= lead_time_days)
    
    Returns:
    - Recommendation with order quantity, urgency, and projected stock levels
    """
    try:
        # Validate SKU has a model
        if sku_id not in models:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"No forecast model found for SKU '{sku_id}'"
            )
        
        # Get current stock
        current_stock = get_current_stock(sku_id)
        
        # Get replenishment settings
        rep_settings = get_replenishment_settings(sku_id)
        
        # Generate forecast (ensure we forecast far enough ahead)
        forecast_days = max(days, rep_settings["lead_time_days"] + 7)
        model = models[sku_id]
        today = date.today()
        
        future_dates = [today + timedelta(days=i) for i in range(1, forecast_days + 1)]
        rows = []
        for d in future_dates:
            rows.append({
                "day_of_week": d.weekday(),
                "month": d.month,
                "day_of_month": d.day,
                "day_of_year": d.timetuple().tm_yday,
                "is_weekend": 1 if d.weekday() >= 5 else 0,
                "week_of_year": d.isocalendar()[1],
            })
        
        X_future = pd.DataFrame(rows)[FEATURES]
        predictions = model.predict(X_future)
        
        # Extract forecasted sales for the lead time period
        forecasted_demand = [max(0, float(pred)) for pred in predictions]
        
        # Calculate recommendation
        recommendation = ReplenishmentRecommendationEngine.calculate_recommendation(
            current_stock=current_stock,
            forecasted_demand_days=forecasted_demand,
            lead_time_days=rep_settings["lead_time_days"],
            min_order_qty=rep_settings["min_order_qty"],
            reorder_point=rep_settings["reorder_point"],
            safety_stock=rep_settings["safety_stock"],
            target_stock_level=rep_settings["target_stock_level"],
        )
        
        return {
            "sku_id": sku_id,
            **recommendation,
        }
    
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error generating recommendation: {str(e)}"
        )
    

