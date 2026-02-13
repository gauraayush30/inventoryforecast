from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import joblib
import pandas as pd
from datetime import date, timedelta

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


model = joblib.load("../backend/model.pkl")

@app.get("/")
def home():
    return {"message": "Inventory Forecast API Running"}
CURRENT_STOCK = 120 
@app.get("/forecast")
def forecast():
    today = date.today()

    future_days = [(today + timedelta(days=i)).toordinal() for i in range(1, 8)]
    X_future = pd.DataFrame(future_days, columns=["day"])

    predictions = model.predict(X_future)

    result = []
    total_demand = 0 
    for i in range(7):
        sales = max(0, round(float(predictions[i]), 2))
        total_demand += sales
        
        result.append({
            "date": (today + timedelta(days=i+1)).strftime("%Y-%m-%d"),
            "predicted_sales": sales

        })
    if CURRENT_STOCK < total_demand:
        stock_status = "REORDER NOW"
    elif CURRENT_STOCK < total_demand * 1.2:
        stock_status = "LOW STOCK"
    else:
        stock_status = "STOCK OK"    

    return {
        "current_stock": CURRENT_STOCK,
        "total_forecast_demand": round(total_demand, 2),
        "stock_status": stock_status,
        "forecast": result
    }
