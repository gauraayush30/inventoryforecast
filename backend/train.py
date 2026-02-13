import pandas as pd
from sqlalchemy import create_engine
from sklearn.linear_model import LinearRegression
import joblib


engine = create_engine(
    "postgresql://postgres:root@localhost:5432/inventory_forecasting"
)


query = """
SELECT sale_date, sales_qty
FROM inventory_sales
ORDER BY sale_date
"""
df = pd.read_sql(query, engine)


df["day"] = range(len(df))  # simple numeric feature

X = df[["day"]]
y = df["sales_qty"]


model = LinearRegression()
model.fit(X, y)


joblib.dump(model, "model.pkl")

print("Model trained and saved as model.pkl")
