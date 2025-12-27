-- =====================================================
-- V35__Product_discounts.sql
-- Descuentos temporales por producto (ofertas)
-- - Una sola oferta por producto (campos en Products)
-- - Permite programar inicio/fin y editar o quitar
-- =====================================================

-- 1) Agregar columnas de descuento a Products (idempotente)
ALTER TABLE Products
  ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NULL,
  ADD COLUMN IF NOT EXISTS discount_start   TIMESTAMP NULL,
  ADD COLUMN IF NOT EXISTS discount_end     TIMESTAMP NULL;

-- 2) Constraint opcional: porcentaje entre 0 y 100
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'chk_products_discount_percent'
  ) THEN
    ALTER TABLE Products
      ADD CONSTRAINT chk_products_discount_percent
      CHECK (discount_percent IS NULL OR (discount_percent > 0 AND discount_percent < 100));
  END IF;
END$$;

-- 3) Índice auxiliar para consultas por oferta activa
--    (útil si en el futuro se filtran solo productos en oferta)
CREATE INDEX IF NOT EXISTS idx_products_discount_period
  ON Products (discount_start, discount_end)
  WHERE discount_percent IS NOT NULL;

