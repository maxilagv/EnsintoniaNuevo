-- V6: Subcategorías y mejoras para checkout/pedidos

-- Crear tabla Subcategories
CREATE TABLE IF NOT EXISTS Subcategories (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  image_url TEXT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT uq_subcat_per_category UNIQUE (category_id, name),
  FOREIGN KEY (category_id) REFERENCES Categories(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- updated_at trigger
CREATE TRIGGER trg_subcategories_updated_at
  BEFORE UPDATE ON Subcategories
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- soft delete trigger
CREATE TRIGGER trg_subcategories_soft_delete
  BEFORE DELETE ON Subcategories
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

-- Agregar subcategory_id a Products
ALTER TABLE Products ADD COLUMN IF NOT EXISTS subcategory_id INT NULL;
ALTER TABLE Products
  ADD CONSTRAINT fk_products_subcategory
  FOREIGN KEY (subcategory_id) REFERENCES Subcategories(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Información de comprador y número de orden en Orders
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS buyer_name VARCHAR(255);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS buyer_email VARCHAR(255);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS buyer_phone VARCHAR(50);
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS order_number VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_order_number ON Orders(order_number) WHERE order_number IS NOT NULL;

