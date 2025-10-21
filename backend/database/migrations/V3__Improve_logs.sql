-- =====================================================
-- V3__Improve_logs.sql
-- Mejora el sistema de logs añadiendo más contexto y severidad.
-- =====================================================

-- 1. Añadir nuevas columnas a la tabla Logs
-- Se usa IF NOT EXISTS para que la migración sea idempotente
ALTER TABLE Logs
  ADD COLUMN IF NOT EXISTS user_id INT NULL,          -- ID del usuario que realizó la operación
  ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45) NULL, -- Dirección IP de origen de la conexión
  ADD COLUMN IF NOT EXISTS table_name VARCHAR(50) NULL, -- Nombre de la tabla afectada
  ADD COLUMN IF NOT EXISTS operation VARCHAR(20) NULL,  -- Tipo de operación (INSERT, UPDATE, DELETE)
  ADD COLUMN IF NOT EXISTS record_id INT NULL,        -- ID del registro afectado
  ADD COLUMN IF NOT EXISTS severity VARCHAR(10) DEFAULT 'INFO'; -- Nivel de severidad del log

-- 2. Actualizar la función fn_audit_log para poblar las nuevas columnas
-- Esta función ahora intentará leer 'app.current_user_id' y 'app.client_ip_address'
-- de las configuraciones de sesión. Estas deben ser establecidas por la aplicación
-- antes de ejecutar las operaciones DML para que los logs sean completos.
CREATE OR REPLACE FUNCTION fn_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  operation_type VARCHAR(10);
  affected_table_name VARCHAR(50);
  affected_record_id INTEGER;
  current_user_id INTEGER;
  client_ip VARCHAR(45);
  log_severity VARCHAR(10) := 'INFO'; -- Severidad por defecto

BEGIN
  affected_table_name := TG_TABLE_NAME;
  
  -- Determinar el tipo de operación y el ID del registro afectado
  IF TG_OP = 'INSERT' THEN
    operation_type := 'INSERT';
    affected_record_id := NEW.id;
    log_severity := 'INFO'; -- Las inserciones son generalmente INFO
  ELSIF TG_OP = 'UPDATE' THEN
    operation_type := 'UPDATE';
    affected_record_id := NEW.id;
    log_severity := 'INFO'; -- Las actualizaciones son generalmente INFO
    -- Ejemplo: Lógica para elevar la severidad para actualizaciones sensibles
    -- IF TG_TABLE_NAME = 'Users' AND (NEW.password_hash IS DISTINCT FROM OLD.password_hash) THEN log_severity := 'HIGH'; END IF;
  ELSIF TG_OP = 'DELETE' THEN
    operation_type := 'DELETE';
    affected_record_id := OLD.id;
    log_severity := 'WARNING'; -- Las eliminaciones suelen ser WARNING/CRITICAL
  END IF;
  
  -- Intentar recuperar user_id y ip_address de la configuración de sesión
  -- La aplicación DEBE establecer estas configuraciones antes de la operación DML.
  -- Por ejemplo: SET app.current_user_id = <ID_USUARIO>; SET app.client_ip_address = '<IP>';
  BEGIN
    current_user_id := current_setting('app.current_user_id', true)::INTEGER;
  EXCEPTION
    WHEN OTHERS THEN
      current_user_id := NULL; -- Si la configuración no está establecida o no es un entero
  END;

  BEGIN
    client_ip := current_setting('app.client_ip_address', true);
  EXCEPTION
    WHEN OTHERS THEN
      client_ip := NULL; -- Si la configuración no está establecida
  END;

  -- Insertar el log de auditoría con el contexto completo
  INSERT INTO Logs (
    log_level,    -- Manteniendo esta columna, aunque 'severity' es más descriptiva
    severity,
    message,
    user_id,
    ip_address,
    table_name,
    operation,
    record_id,
    created_at
  )
  VALUES (
    log_severity, -- Usamos la severidad determinada para log_level
    log_severity,
    format('Operation: %s on table %s, record_id: %s', operation_type, affected_table_name, affected_record_id),
    current_user_id,
    client_ip,
    affected_table_name,
    operation_type,
    affected_record_id,
    CURRENT_TIMESTAMP
  );
  
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- 3. Añadir nuevos índices para mejorar el rendimiento de las consultas en la tabla Logs
CREATE INDEX IF NOT EXISTS idx_logs_user_id ON Logs(user_id);
CREATE INDEX IF NOT EXISTS idx_logs_severity ON Logs(severity);
CREATE INDEX IF NOT EXISTS idx_logs_created_at ON Logs(created_at);
CREATE INDEX IF NOT EXISTS idx_logs_table_name_operation ON Logs(table_name, operation);
