-- =====================================================
-- V5__Inventory_snapshots.sql
-- Snapshots mensuales + vista comparativa mes pasado vs ahora
-- =====================================================

-- 1) Tabla de snapshots (una fila por producto/mes)
CREATE TABLE IF NOT EXISTS InventorySnapshots (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL,
  month_start DATE NOT NULL,                 -- 1° del mes (ej: 2025-09-01)
  stock_at_month_start INT NOT NULL,         -- stock al inicio del mes
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (product_id, month_start),
  FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_invsnap_product_month ON InventorySnapshots(product_id, month_start);

-- 2) Función para tomar snapshot al comienzo de un mes dado
CREATE OR REPLACE FUNCTION take_monthly_inventory_snapshot(p_run_date DATE DEFAULT CURRENT_DATE)
RETURNS INTEGER AS $$
DECLARE
  v_month_start DATE := date_trunc('month', p_run_date)::DATE;
  v_inserted INT;
BEGIN
  INSERT INTO InventorySnapshots (product_id, month_start, stock_at_month_start)
  SELECT p.id, v_month_start, p.stock_quantity
  FROM Products p
  ON CONFLICT (product_id, month_start) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$ LANGUAGE plpgsql;

-- 3) Vista: comparación "mes pasado vs ahora"
CREATE OR REPLACE VIEW products_stock_monthly_comparison AS
WITH params AS (
  SELECT
    date_trunc('month', CURRENT_DATE)::DATE AS curr_month_start,
    (date_trunc('month', CURRENT_DATE)::DATE - INTERVAL '1 month')::DATE AS prev_month_start
),
prev AS (
  SELECT s.product_id, s.stock_at_month_start
  FROM InventorySnapshots s
  JOIN params pa ON s.month_start = pa.prev_month_start
)
SELECT
  p.id AS product_id,
  p.name,
  c.name AS category_name,
  COALESCE(prev.stock_at_month_start, 0) AS stock_last_month,
  p.stock_quantity AS stock_now,
  (p.stock_quantity - COALESCE(prev.stock_at_month_start, 0)) AS delta
FROM Products p
LEFT JOIN prev ON prev.product_id = p.id
LEFT JOIN Categories c ON c.id = p.category_id
WHERE p.deleted_at IS NULL;

