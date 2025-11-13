-- V16: Audit log table for admin actions

CREATE TABLE IF NOT EXISTS AuditLog (
  id SERIAL PRIMARY KEY,
  actor VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100),
  entity_id INT,
  meta JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_auditlog_created_at ON AuditLog(created_at);
CREATE INDEX IF NOT EXISTS idx_auditlog_action ON AuditLog(action);
CREATE INDEX IF NOT EXISTS idx_auditlog_entity ON AuditLog(entity_type, entity_id);

