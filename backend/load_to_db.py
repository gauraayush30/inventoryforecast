import pandas as pd
from sqlalchemy import create_engine


DB_USER = "postgres"
DB_PASSWORD = "root"
DB_HOST = "localhost"
DB_PORT = "5432"
DB_NAME = "inventory_forecasting"


engine = create_engine(
    f"postgresql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
)



df = pd.read_csv("../data/inventory_sales.csv")




df.to_sql(
    "inventory_sales",
    engine,
    if_exists="append",
    index=False
)

print("Data inserted successfully into inventory_sales table")
