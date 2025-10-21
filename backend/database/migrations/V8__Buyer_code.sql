-- V8: Buyer reusable code for checkout

-- Add buyer_code to Orders to allow a reusable customer code
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS buyer_code VARCHAR(64);

-- Index to speed up lookups by buyer_code (nullable)
CREATE INDEX IF NOT EXISTS idx_orders_buyer_code ON Orders(buyer_code) WHERE buyer_code IS NOT NULL;

