-- V22: Primary role per user

ALTER TABLE IF EXISTS UserRoles
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'uq_user_primary_role'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX uq_user_primary_role ON UserRoles(user_id) WHERE is_primary = TRUE';
  END IF;
END$$;

