-- =====================================================
-- V4__Add_product_details.sql
-- Añade campos para stock, URL de componentes y URL de video a la tabla Products.
-- Además, introduce una tabla de StockMovements y una función para gestionar el stock.
-- =====================================================

-- 1. Añadir nuevas columnas a la tabla Products
-- Se usa IF NOT EXISTS para que la migración sea idempotente y segura
ALTER TABLE Products
  ADD COLUMN IF NOT EXISTS components_url TEXT NULL,    -- URL para detalles de componentes (opcional)
  ADD COLUMN IF NOT EXISTS video_url TEXT NULL,         -- URL para video del producto (opcional)
  ADD COLUMN IF NOT EXISTS stock_quantity INT NOT NULL DEFAULT 0; -- Cantidad en stock, con un valor por defecto de 0

-- 2. Añadir constraint para evitar stocks negativos "a mano"
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_products_stock_nonneg'
  ) THEN
    ALTER TABLE Products
      ADD CONSTRAINT chk_products_stock_nonneg CHECK (stock_quantity >= 0);
  END IF;
END$$;

-- 3. Crear tabla StockMovements para un control de stock detallado
CREATE TABLE IF NOT EXISTS StockMovements (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL,
  movement_type VARCHAR(50) NOT NULL, -- 'entrada', 'salida', 'ajuste'
  quantity_change INT NOT NULL,       -- Cantidad que se añadió o se retiró (puede ser negativo para salidas)
  new_stock_level INT NOT NULL,       -- Nivel de stock después del movimiento
  reason TEXT NULL,                   -- Razón del movimiento (ej. "venta", "compra", "devolución", "inventario inicial")
  user_id INT NULL,                   -- ID del usuario que realizó el movimiento (para auditoría)
  ip_address VARCHAR(45) NULL,        -- Dirección IP del usuario (para auditoría)
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL -- Si Users se borra, user_id en movimientos queda NULL
);

-- 4. Índices/constraints para StockMovements
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_movement_type'
  ) THEN
    ALTER TABLE StockMovements
      ADD CONSTRAINT chk_movement_type
      CHECK (movement_type IN ('entrada', 'salida', 'ajuste'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_stockmovements_product_id ON StockMovements(product_id);
CREATE INDEX IF NOT EXISTS idx_stockmovements_created_at ON StockMovements(created_at);

-- 6. Función para ajustar el stock de un producto (concurrencia segura y fallback de sesión)
-- Esta función actualiza el stock en la tabla Products e inserta un registro en StockMovements.
CREATE OR REPLACE FUNCTION adjust_product_stock(
  p_product_id INTEGER,
  p_quantity_change INTEGER,
  p_movement_type VARCHAR(50),
  p_reason TEXT DEFAULT NULL,
  p_current_user_id INTEGER DEFAULT NULL,
  p_client_ip_address VARCHAR(45) DEFAULT NULL
)
RETURNS BOOLEAN AS $$
DECLARE
  v_new_stock INTEGER;
  v_effective_user_id INTEGER;
  v_effective_client_ip VARCHAR(45);
BEGIN
  UPDATE Products
     SET stock_quantity = stock_quantity + p_quantity_change,
         updated_at     = CURRENT_TIMESTAMP
   WHERE id = p_product_id
     AND stock_quantity + p_quantity_change >= 0
  RETURNING stock_quantity INTO v_new_stock;

  IF v_new_stock IS NULL THEN
    RAISE EXCEPTION 'Stock insuficiente o producto inexistente (id=%)', p_product_id;
  END IF;

  SELECT COALESCE(p_current_user_id, NULLIF(current_setting('app.current_user_id', true), '')::INT) INTO v_effective_user_id;
  SELECT COALESCE(p_client_ip_address, current_setting('app.client_ip_address', true)) INTO v_effective_client_ip;

  INSERT INTO StockMovements (
    product_id,
    movement_type,
    quantity_change,
    new_stock_level,
    reason,
    user_id,
    ip_address
  )
  VALUES (
    p_product_id,
    p_movement_type,
    p_quantity_change,
    v_new_stock,
    p_reason,
    v_effective_user_id,
    v_effective_client_ip
  );

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- 7. Trigger de auditoría para StockMovements (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'fn_audit_log') THEN
    DROP TRIGGER IF EXISTS trg_stockmovements_audit ON StockMovements;
    CREATE TRIGGER trg_stockmovements_audit
      AFTER INSERT OR UPDATE OR DELETE ON StockMovements
      FOR EACH ROW
      EXECUTE FUNCTION fn_audit_log();
  END IF;
END
$$;

-- 8. Trigger para prevenir actualizaciones directas de stock en Products
CREATE OR REPLACE FUNCTION prevent_direct_stock_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    RAISE EXCEPTION 'Actualice stock usando adjust_product_stock() en vez de modificar directamente la columna.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_products_prevent_direct_stock ON Products;
CREATE TRIGGER trg_products_prevent_direct_stock
  BEFORE UPDATE ON Products
  FOR EACH ROW
  EXECUTE FUNCTION prevent_direct_stock_update();

-- 9/10. Comentarios de futuras extensiones
-- (updated_at y soft delete en StockMovements opcional)
