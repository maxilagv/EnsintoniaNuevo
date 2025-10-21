-- =====================================================
-- V2__Triggers_and_soft_delete.sql
-- Add triggers for automatic updates and soft delete functionality
-- =====================================================

-- =====================================================
-- 1. ADD DELETED_AT COLUMNS FOR SOFT DELETE
-- =====================================================

-- Add deleted_at column to main tables for logical deletion
ALTER TABLE Users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE Roles ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE Permissions ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE Categories ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE Products ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE Orders ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE OrderItems ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;
ALTER TABLE Payments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP DEFAULT NULL;

-- =====================================================
-- 2. CREATE TRIGGER FUNCTIONS
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

-- Function to log all database operations (mejorada en V3, solo referencia aquí)
-- Renombramos esta función para evitar conflicto con la versión más avanzada de V3
CREATE OR REPLACE FUNCTION fn_audit_log_v2()
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
  
  -- Insert audit log (versión básica)
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
-- 3. CREATE TRIGGERS FOR AUTOMATIC UPDATED_AT
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
-- 4. CREATE TRIGGERS FOR SOFT DELETE
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
-- 5. CREATE AUDIT TRIGGERS
-- =====================================================

-- Audit triggers to log all operations
CREATE TRIGGER trg_users_audit
  AFTER INSERT OR UPDATE OR DELETE ON Users
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log_v2(); -- Usamos la función renombrada para esta versión

CREATE TRIGGER trg_products_audit
  AFTER INSERT OR UPDATE OR DELETE ON Products
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log_v2(); -- Usamos la función renombrada para esta versión

CREATE TRIGGER trg_orders_audit
  AFTER INSERT OR UPDATE OR DELETE ON Orders
  FOR EACH ROW
  EXECUTE FUNCTION fn_audit_log_v2(); -- Usamos la función renombrada para esta versión

-- =====================================================
-- 6. CREATE INDEXES FOR SOFT DELETE QUERIES
-- =====================================================

-- Indexes for deleted_at column to optimize soft delete queries
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON Users(deleted_at);
CREATE INDEX IF NOT EXISTS idx_roles_deleted_at ON Roles(deleted_at);
CREATE INDEX IF NOT EXISTS idx_permissions_deleted_at ON Permissions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_categories_deleted_at ON Categories(deleted_at);
CREATE INDEX IF NOT EXISTS idx_products_deleted_at ON Products(deleted_at);
CREATE INDEX IF NOT EXISTS idx_orders_deleted_at ON Orders(deleted_at);
CREATE INDEX IF NOT EXISTS idx_orderitems_deleted_at ON OrderItems(deleted_at);
CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON Payments(deleted_at);

-- Composite indexes for active records (deleted_at IS NULL)
CREATE INDEX IF NOT EXISTS idx_users_active ON Users(id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_products_active ON Products(category_id, id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_orders_active ON Orders(user_id, order_date) WHERE deleted_at IS NULL;

-- =====================================================
-- 7. CREATE VIEWS FOR ACTIVE RECORDS
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
-- 8. CREATE UTILITY FUNCTIONS
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
