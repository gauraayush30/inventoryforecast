"""
Database helper – all PostgreSQL queries live here.
"""

from sqlalchemy import create_engine, text

DB_URL = "postgresql://postgres.qnvdcwrltxgyyyptwvat:myFkt784VTW98F19@aws-1-ap-south-1.pooler.supabase.com:5432/postgres"

engine = create_engine(DB_URL, pool_pre_ping=True)


#  SKU list 
def get_all_skus() -> list[dict]:
    """Return distinct SKUs with their latest stock level and row count."""
    query = text("""
        SELECT
            s.sku_id,
            s.sku_name,
            s.stock_level AS current_stock,
            cnt.total_records
        FROM inventory_sales s
        INNER JOIN (
            SELECT sku_id,
                   MAX(sale_date)  AS max_date,
                   COUNT(*)::int  AS total_records
            FROM inventory_sales
            GROUP BY sku_id
        ) cnt ON s.sku_id = cnt.sku_id AND s.sale_date = cnt.max_date
        ORDER BY s.sku_id
    """)
    with engine.connect() as conn:
        rows = conn.execute(query).mappings().all()
    return [dict(r) for r in rows]


#  Historical sales 
def get_history(sku_id: str, days: int) -> list[dict]:
    """Return the last N days of sales for a given SKU."""
    query = text("""
        SELECT sale_date, sales_qty, purchase_qty, stock_level
        FROM inventory_sales
        WHERE sku_id = :sku_id
        ORDER BY sale_date DESC
        LIMIT :days
    """)
    with engine.connect() as conn:
        rows = conn.execute(query, {"sku_id": sku_id, "days": days}).mappings().all()

    # Reverse so oldest-first
    return [
        {
            "date": str(r["sale_date"]),
            "sales_qty": int(r["sales_qty"]),
            "purchase_qty": int(r["purchase_qty"]),
            "stock_level": int(r["stock_level"]),
        }
        for r in reversed(rows)
    ]


#  Current stock for a single SKU 
def get_current_stock(sku_id: str) -> int:
    """Return the most recent stock_level for the SKU."""
    query = text("""
        SELECT stock_level
        FROM inventory_sales
        WHERE sku_id = :sku_id
        ORDER BY sale_date DESC
        LIMIT 1
    """)
    with engine.connect() as conn:
        row = conn.execute(query, {"sku_id": sku_id}).fetchone()
    return int(row[0]) if row else 0


#  Record a transaction (sale/purchase) 
def record_transaction(sku_id: str, sales_qty: int, purchase_qty: int, transaction_date: str) -> dict:
    """Record a sales/purchase transaction and update stock level.
    
    Args:
        sku_id: The SKU identifier
        sales_qty: Quantity sold (reduces stock)
        purchase_qty: Quantity purchased (increases stock)
        transaction_date: Date of transaction (YYYY-MM-DD format)
    
    Returns:
        Dictionary with transaction details and updated stock level
    
    Raises:
        ValueError: If SKU not found or invalid data
    """
    # Get current stock and SKU info
    get_sku_query = text("""
        SELECT sku_id, sku_name, stock_level
        FROM inventory_sales
        WHERE sku_id = :sku_id
        ORDER BY sale_date DESC
        LIMIT 1
    """)
    
    with engine.connect() as conn:
        sku_row = conn.execute(get_sku_query, {"sku_id": sku_id}).fetchone()
    
    if not sku_row:
        raise ValueError(f"SKU '{sku_id}' not found in database")
    
    current_stock = int(sku_row[2])
    sku_name = sku_row[1]
    
    # Calculate new stock level: current + purchases - sales
    new_stock_level = current_stock + purchase_qty - sales_qty
    
    # Ensure stock doesn't go negative
    if new_stock_level < 0:
        raise ValueError(f"Insufficient stock. Current: {current_stock}, Cannot sell: {sales_qty}")
    
    # Insert transaction record
    insert_query = text("""
        INSERT INTO inventory_sales (sku_id, sku_name, sale_date, sales_qty, purchase_qty, stock_level)
        VALUES (:sku_id, :sku_name, :sale_date, :sales_qty, :purchase_qty, :stock_level)
        RETURNING id
    """)
    
    with engine.begin() as conn:
        result = conn.execute(
            insert_query,
            {
                "sku_id": sku_id,
                "sku_name": sku_name,
                "sale_date": transaction_date,
                "sales_qty": sales_qty,
                "purchase_qty": purchase_qty,
                "stock_level": new_stock_level,
            }
        )
        transaction_id = result.scalar()
    
    return {
        "id": transaction_id,
        "sku_id": sku_id,
        "sku_name": sku_name,
        "sale_date": transaction_date,
        "sales_qty": sales_qty,
        "purchase_qty": purchase_qty,
        "previous_stock": current_stock,
        "new_stock_level": new_stock_level,
        "message": "Transaction recorded successfully"
    }
