-- V24: Clients (Customers) module

-- Tabla principal de Clientes
CREATE TABLE IF NOT EXISTS Clients (
  id SERIAL PRIMARY KEY,
  code VARCHAR(64) NOT NULL,                  -- Código de cliente (auto-generado, único por cliente activo)
  name VARCHAR(255) NOT NULL,                 -- Razón Social / Nombre
  fantasy_name VARCHAR(255),                  -- Nombre de fantasía / Apellido (según tipo)
  client_type VARCHAR(20) NOT NULL DEFAULT 'FISICA', -- Persona física / jurídica
  tax_id VARCHAR(32) NOT NULL,                -- CUIT/CUIL/DNI normalizado
  tax_id_type VARCHAR(10),                    -- CUIT / CUIL / DNI (opcional)
  iva_condition VARCHAR(50) NOT NULL,         -- Condición IVA (Responsable Inscripto, Monotributo, etc.)
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  address VARCHAR(255),
  locality VARCHAR(255),
  province VARCHAR(255),
  postal_code VARCHAR(20),
  contact_name VARCHAR(255),
  notes TEXT,
  credit_limit NUMERIC(12,2),                 -- Límite de crédito (opcional)
  birthdate DATE,                             -- Para reportes de cumpleaños del mes (opcional)
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE', -- ACTIVE / INACTIVE
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

-- Restricción simple de estado
ALTER TABLE Clients
  ADD CONSTRAINT chk_clients_status
  CHECK (status IN ('ACTIVE','INACTIVE'));

-- Unicidad lógica por código y documento (solo clientes no borrados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_code
  ON Clients(code)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_tax_id
  ON Clients(tax_id)
  WHERE tax_id IS NOT NULL
    AND deleted_at IS NULL;

-- Índices de apoyo para búsquedas y filtros
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON Clients(deleted_at);
CREATE INDEX IF NOT EXISTS idx_clients_status ON Clients(status);
CREATE INDEX IF NOT EXISTS idx_clients_locality ON Clients(locality);
CREATE INDEX IF NOT EXISTS idx_clients_province ON Clients(province);
CREATE INDEX IF NOT EXISTS idx_clients_created_at ON Clients(created_at);
CREATE INDEX IF NOT EXISTS idx_clients_birthdate ON Clients(birthdate) WHERE birthdate IS NOT NULL;

-- Trigger de updated_at
CREATE TRIGGER trg_clients_updated_at
  BEFORE UPDATE ON Clients
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

-- Trigger de soft delete (usa deleted_at en lugar de borrado físico)
CREATE TRIGGER trg_clients_soft_delete
  BEFORE DELETE ON Clients
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

-- Vista de conveniencia para clientes activos
CREATE OR REPLACE VIEW active_clients AS
SELECT *
FROM Clients
WHERE deleted_at IS NULL;

