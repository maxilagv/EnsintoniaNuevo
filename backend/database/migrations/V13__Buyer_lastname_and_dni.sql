-- V13: Add buyer_lastname and buyer_dni to Orders

ALTER TABLE Orders ADD COLUMN IF NOT EXISTS buyer_lastname VARCHAR(255);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS buyer_dni VARCHAR(16);

-- Optional index for DNI lookups if needed in the future
CREATE INDEX IF NOT EXISTS idx_orders_buyer_dni ON Orders(buyer_dni) WHERE buyer_dni IS NOT NULL;

