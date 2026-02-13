"""
Database helper – all PostgreSQL queries live here.
"""

from sqlalchemy import create_engine, text

DB_URL = ""

engine = create_engine(DB_URL, pool_pre_ping=True)


# ── SKU list ─────────────────────────────────────────────────
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


# ── Historical sales ────────────────────────────────────────
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


# ── Current stock for a single SKU ──────────────────────────
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
