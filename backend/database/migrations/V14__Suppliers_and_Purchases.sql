-- V14: Suppliers and Purchases module

-- Suppliers table
CREATE TABLE IF NOT EXISTS Suppliers (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  cuit VARCHAR(32),
  contact_name VARCHAR(255),
  contact_phone VARCHAR(50),
  contact_email VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_suppliers_cuit ON Suppliers(cuit) WHERE cuit IS NOT NULL;

-- updated_at trigger
CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON Suppliers
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- soft delete trigger
CREATE TRIGGER trg_suppliers_soft_delete
  BEFORE DELETE ON Suppliers
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

-- Purchases table
CREATE TABLE IF NOT EXISTS Purchases (
  id SERIAL PRIMARY KEY,
  supplier_id INT NULL REFERENCES Suppliers(id) ON UPDATE CASCADE ON DELETE SET NULL,
  purchase_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(32) NOT NULL DEFAULT 'RECEIVED',
  currency VARCHAR(10) DEFAULT 'ARS',
  total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchases_supplier ON Purchases(supplier_id);
CREATE INDEX IF NOT EXISTS idx_purchases_date ON Purchases(purchase_date);

CREATE TRIGGER trg_purchases_updated_at
  BEFORE UPDATE ON Purchases
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_purchases_soft_delete
  BEFORE DELETE ON Purchases
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

-- PurchaseItems
CREATE TABLE IF NOT EXISTS PurchaseItems (
  id SERIAL PRIMARY KEY,
  purchase_id INT NOT NULL REFERENCES Purchases(id) ON UPDATE CASCADE ON DELETE CASCADE,
  product_id INT NOT NULL REFERENCES Products(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  quantity INT NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(12,2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_purchaseitems_purchase ON PurchaseItems(purchase_id);
CREATE INDEX IF NOT EXISTS idx_purchaseitems_product ON PurchaseItems(product_id);

CREATE TRIGGER trg_purchaseitems_updated_at
  BEFORE UPDATE ON PurchaseItems
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_purchaseitems_soft_delete
  BEFORE DELETE ON PurchaseItems
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

