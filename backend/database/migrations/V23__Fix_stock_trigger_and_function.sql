-- V23: Permitir que adjust_product_stock actualice stock sin disparar el error,
--      pero seguir bloqueando updates directos a Products.stock_quantity.

-- 1) Reemplazar adjust_product_stock para marcar un flag de sesi�n
--    que el trigger usar� para permitir el UPDATE interno.
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
  -- Flag de bypass para el trigger prevent_direct_stock_update
  PERFORM set_config('app.bypass_stock_trigger', '1', true);
  BEGIN
    UPDATE Products
       SET stock_quantity = stock_quantity + p_quantity_change,
           updated_at     = CURRENT_TIMESTAMP
     WHERE id = p_product_id
       AND stock_quantity + p_quantity_change >= 0
    RETURNING stock_quantity INTO v_new_stock;
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.bypass_stock_trigger', '0', true);
    RAISE;
  END;
  PERFORM set_config('app.bypass_stock_trigger', '0', true);

  IF v_new_stock IS NULL THEN
    RAISE EXCEPTION 'Stock insuficiente o producto inexistente (id=%)', p_product_id;
  END IF;

  SELECT COALESCE(p_current_user_id, NULLIF(current_setting('app.current_user_id', true), '')::INT)
    INTO v_effective_user_id;
  SELECT COALESCE(p_client_ip_address, current_setting('app.client_ip_address', true))
    INTO v_effective_client_ip;

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

-- 2) Reemplazar prevent_direct_stock_update para respetar el flag de bypass
CREATE OR REPLACE FUNCTION prevent_direct_stock_update()
RETURNS TRIGGER AS $$
DECLARE
  v_bypass TEXT;
BEGIN
  BEGIN
    v_bypass := current_setting('app.bypass_stock_trigger', true);
  EXCEPTION WHEN OTHERS THEN
    v_bypass := NULL;
  END;

  -- Si el flag est� activado (desde adjust_product_stock), permitir el UPDATE
  IF v_bypass = '1' THEN
    RETURN NEW;
  END IF;

  -- Para cualquier otro caso, seguir bloqueando cambios directos de stock_quantity
  IF NEW.stock_quantity IS DISTINCT FROM OLD.stock_quantity THEN
    RAISE EXCEPTION 'Actualice stock usando adjust_product_stock() en vez de modificar directamente la columna.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3) Asegurar que el trigger siga apuntando a la funci�n actualizada
DROP TRIGGER IF EXISTS trg_products_prevent_direct_stock ON Products;
CREATE TRIGGER trg_products_prevent_direct_stock
  BEFORE UPDATE ON Products
  FOR EACH ROW
  EXECUTE FUNCTION prevent_direct_stock_update();

