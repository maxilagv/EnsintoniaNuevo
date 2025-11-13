-- V19: Role hierarchy (optional)

ALTER TABLE IF EXISTS Roles
  ADD COLUMN IF NOT EXISTS parent_role_id INT NULL;

ALTER TABLE IF EXISTS Roles
  ADD CONSTRAINT IF NOT EXISTS fk_roles_parent
  FOREIGN KEY (parent_role_id) REFERENCES Roles(id)
  ON UPDATE CASCADE ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_roles_parent'
  ) THEN
    EXECUTE 'CREATE INDEX idx_roles_parent ON Roles(parent_role_id)';
  END IF;
END$$;

