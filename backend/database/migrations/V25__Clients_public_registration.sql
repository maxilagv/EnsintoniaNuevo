-- V25: Public client registration and origin

-- Nueva columna para indicar el origen del cliente
-- INTERNAL: creado desde panel admin
-- WEB     : registrado desde el catálogo / checkout público
ALTER TABLE Clients
  ADD COLUMN IF NOT EXISTS origin VARCHAR(20) NOT NULL DEFAULT 'INTERNAL';

-- Ampliar el estado para permitir clientes pendientes de aprobación
ALTER TABLE Clients
  DROP CONSTRAINT IF EXISTS chk_clients_status;

ALTER TABLE Clients
  ADD CONSTRAINT chk_clients_status
  CHECK (status IN ('ACTIVE','INACTIVE','PENDING'));

-- Índice auxiliar para futuros filtros por origen
CREATE INDEX IF NOT EXISTS idx_clients_origin ON Clients(origin);

