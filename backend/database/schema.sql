-- =====================================================
-- ADVANCED SQL DATABASE SCHEMA
-- Normalized Relational Model with Triggers and Soft Delete
-- =====================================================

-- NOTE: This is the complete schema. For production use with Flyway,
-- use the migration files in database/migrations/ directory instead.

-- =====================================================
-- 1. MAIN TABLES WITH SOFT DELETE SUPPORT
-- =====================================================

-- Users table
CREATE TABLE Users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

-- Roles table
CREATE TABLE Roles (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

-- Permissions table
CREATE TABLE Permissions (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

-- UserRoles junction table
CREATE TABLE UserRoles (
  user_id INT NOT NULL,
  role_id INT NOT NULL,
  PRIMARY KEY (user_id, role_id),
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- RolePermissions junction table
CREATE TABLE RolePermissions (
  role_id INT NOT NULL,
  permission_id INT NOT NULL,
  PRIMARY KEY (role_id, permission_id),
  FOREIGN KEY (role_id) REFERENCES Roles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (permission_id) REFERENCES Permissions(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Categories table
CREATE TABLE Categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) UNIQUE NOT NULL,
  image_url TEXT NULL,
  image_file_path TEXT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

-- Products table
CREATE TABLE Products (
  id SERIAL PRIMARY KEY,
  category_id INT NOT NULL,
  name VARCHAR(255) NOT NULL,
  image_url TEXT NULL,
  image_file_path TEXT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  stock_quantity INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (category_id) REFERENCES Categories(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Orders table
CREATE TABLE Orders (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,              -- Usuario que realiza la compra (cliente o actor principal)
  seller_user_id INT NULL,           -- Usuario vendedor que se lleva la comisión
  order_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (seller_user_id) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- OrderItems table
CREATE TABLE OrderItems (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL,
  product_id INT NOT NULL,
  quantity INT NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE ON UPDATE CASCADE,
  FOREIGN KEY (product_id) REFERENCES Products(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Payments table
CREATE TABLE Payments (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL,
  payment_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(100) NOT NULL,
  status VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,
  FOREIGN KEY (order_id) REFERENCES Orders(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Logs table (no soft delete needed for logs)
CREATE TABLE Logs (
  id SERIAL PRIMARY KEY,
  log_level VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2. TRIGGER FUNCTIONS
-- =====================================================

-- Function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function for soft delete (logical deletion)
CREATE OR REPLACE FUNCTION fn_soft_delete()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if the record is not already soft-deleted
  IF OLD.deleted_at IS NULL THEN
    -- Temporarily disable triggers to avoid recursion
    PERFORM set_config('session_replication_role', 'replica', true);
    
    -- Update the record to mark it as deleted instead of physically deleting it
    EXECUTE format('UPDATE %I SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1', TG_TABLE_NAME)
      USING OLD.id;
    
    -- Re-enable triggers
    PERFORM set_config('session_replication_role', 'origin', true);
    
    -- Cancel the DELETE operation (record is now logically deleted)
    RETURN NULL;
  ELSE
    -- If already soft-deleted, allow physical deletion (optional behavior)
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to log all database operations
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  operation_type VARCHAR(10);
  table_name VARCHAR(50);
  record_id INTEGER;
BEGIN
  table_name := TG_TABLE_NAME;
  
  IF TG_OP = 'INSERT' THEN
    operation_type := 'INSERT';
    record_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    operation_type := 'UPDATE';
    record_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    operation_type := 'DELETE';
    record_id := OLD.id;
  END IF;
  
  -- Insert audit log
  INSERT INTO Logs (log_level, message, created_at)
  VALUES (
    'INFO',
    format('Operation: %s on table %s, record_id: %s', operation_type, table_name, record_id),
    CURRENT_TIMESTAMP
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. TRIGGERS FOR AUTOMATIC UPDATED_AT
-- =====================================================

-- Triggers for automatic updated_at timestamp update
CREATE TRIGGER trg_users_updated_at
  BEFORE UPDATE ON Users
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_roles_updated_at
  BEFORE UPDATE ON Roles
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_permissions_updated_at
  BEFORE UPDATE ON Permissions
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_categories_updated_at
  BEFORE UPDATE ON Categories
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_products_updated_at
  BEFORE UPDATE ON Products
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_orders_updated_at
  BEFORE UPDATE ON Orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_orderitems_updated_at
  BEFORE UPDATE ON OrderItems
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON Payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- =====================================================
-- 4. TRIGGERS FOR SOFT DELETE
-- =====================================================

-- Triggers for soft delete functionality
CREATE TRIGGER trg_users_soft_delete
  BEFORE DELETE ON Users
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TRIGGER trg_roles_soft_delete
  BEFORE DELETE ON Roles
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TRIGGER trg_permissions_soft_delete
  BEFORE DELETE ON Permissions
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TRIGGER trg_categories_soft_delete
  BEFORE DELETE ON Categories
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TRIGGER trg_products_soft_delete
  BEFORE DELETE ON Products
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TRIGGER trg_orders_soft_delete
  BEFORE DELETE ON Orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TRIGGER trg_orderitems_soft_delete
  BEFORE DELETE ON OrderItems
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TRIGGER trg_payments_soft_delete
  BEFORE DELETE ON Payments
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

-- =====================================================
-- 5. AUDIT TRIGGERS
-- =====================================================

-- Audit triggers to log all operations
CREATE TRIGGER trg_users_audit
  AFTER INSERT OR UPDATE OR DELETE ON Users
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_products_audit
  AFTER INSERT OR UPDATE OR DELETE ON Products
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log();

CREATE TRIGGER trg_orders_audit
  AFTER INSERT OR UPDATE OR DELETE ON Orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log();

-- =====================================================
-- 6. INDEXES FOR PERFORMANCE
-- =====================================================

-- Basic indexes
CREATE INDEX idx_users_email ON Users(email);
CREATE INDEX idx_users_created_at ON Users(created_at);
CREATE INDEX idx_products_category_id ON Products(category_id);
CREATE INDEX idx_products_name ON Products(name);
CREATE INDEX idx_orders_user_id ON Orders(user_id);
CREATE INDEX idx_orders_seller_user_id ON Orders(seller_user_id);
CREATE INDEX idx_orders_status ON Orders(status);
CREATE INDEX idx_orders_order_date ON Orders(order_date);
CREATE INDEX idx_orderitems_order_id ON OrderItems(order_id);
CREATE INDEX idx_orderitems_product_id ON OrderItems(product_id);
CREATE INDEX idx_payments_order_id ON Payments(order_id);
CREATE INDEX idx_payments_status ON Payments(status);
CREATE INDEX idx_logs_log_level ON Logs(log_level);
CREATE INDEX idx_logs_created_at ON Logs(created_at);

-- Indexes for soft delete queries
CREATE INDEX idx_users_deleted_at ON Users(deleted_at);
CREATE INDEX idx_roles_deleted_at ON Roles(deleted_at);
CREATE INDEX idx_permissions_deleted_at ON Permissions(deleted_at);
CREATE INDEX idx_categories_deleted_at ON Categories(deleted_at);
CREATE INDEX idx_products_deleted_at ON Products(deleted_at);
CREATE INDEX idx_orders_deleted_at ON Orders(deleted_at);
CREATE INDEX idx_orderitems_deleted_at ON OrderItems(deleted_at);
CREATE INDEX idx_payments_deleted_at ON Payments(deleted_at);

-- Composite indexes for active records
CREATE INDEX idx_users_active ON Users(id) WHERE deleted_at IS NULL;
CREATE INDEX idx_products_active ON Products(category_id, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_orders_active ON Orders(user_id, order_date) WHERE deleted_at IS NULL;

-- =====================================================
-- 7. VIEWS FOR ACTIVE RECORDS
-- =====================================================

-- Views to easily query only active (non-deleted) records
CREATE VIEW active_users AS
SELECT * FROM Users WHERE deleted_at IS NULL;

CREATE VIEW active_roles AS
SELECT * FROM Roles WHERE deleted_at IS NULL;

CREATE VIEW active_permissions AS
SELECT * FROM Permissions WHERE deleted_at IS NULL;

CREATE VIEW active_categories AS
SELECT * FROM Categories WHERE deleted_at IS NULL;

CREATE VIEW active_products AS
SELECT * FROM Products WHERE deleted_at IS NULL;

CREATE VIEW active_orders AS
SELECT * FROM Orders WHERE deleted_at IS NULL;

CREATE VIEW active_orderitems AS
SELECT * FROM OrderItems WHERE deleted_at IS NULL;

CREATE VIEW active_payments AS
SELECT * FROM Payments WHERE deleted_at IS NULL;

-- =====================================================
-- 8. UTILITY FUNCTIONS
-- =====================================================

-- Function to restore a soft-deleted record
CREATE OR REPLACE FUNCTION restore_record(table_name TEXT, record_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  EXECUTE format('UPDATE %I SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL', table_name)
    USING record_id;
  
  IF FOUND THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to permanently delete a soft-deleted record
CREATE OR REPLACE FUNCTION hard_delete_record(table_name TEXT, record_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  EXECUTE format('DELETE FROM %I WHERE id = $1 AND deleted_at IS NOT NULL', table_name)
    USING record_id;
  
  IF FOUND THEN
    RETURN TRUE;
  ELSE
    RETURN FALSE;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to get soft-deleted records count
CREATE OR REPLACE FUNCTION get_deleted_count(table_name TEXT)
RETURNS INTEGER AS $$
DECLARE
  count_result INTEGER;
BEGIN
  EXECUTE format('SELECT COUNT(*) FROM %I WHERE deleted_at IS NOT NULL', table_name)
    INTO count_result;
  
  RETURN count_result;
END;
$$ LANGUAGE plpgsql;
