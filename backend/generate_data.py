import pandas as pd
import random
from datetime import datetime, timedelta

start_date = datetime(2023, 1, 1)
rows = []
stock = 500

for i in range(2500):
    sale_date = start_date + timedelta(days=i)
    item_id = random.randint(1, 5)

    sales_qty = random.randint(10, 40)

    purchase_qty = 0
    if stock < 200:
        purchase_qty = random.randint(200, 400)

    stock = stock - sales_qty + purchase_qty

    rows.append([
        item_id,
        sale_date.date(),
        sales_qty,
        purchase_qty,
        stock
    ])

df = pd.DataFrame(
    rows,
    columns=[
        "item_id",
        "sale_date",
        "sales_qty",
        "purchase_qty",
        "stock_level"
    ]
)

df.to_csv("../data/inventory_sales.csv", index=False)

print("Inventory data generated successfully!")
