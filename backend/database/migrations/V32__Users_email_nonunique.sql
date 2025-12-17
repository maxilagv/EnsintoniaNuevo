-- V32: Allow non-unique emails on Users
-- Permite que distintos usuarios (por ejemplo, varios vendedores) compartan el mismo email.

DO $$
BEGIN
  -- Drop implicit unique constraint on Users.email if it exists
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'users'::regclass
      AND contype = 'u'
      AND conname = 'users_email_key'
  ) THEN
    ALTER TABLE Users DROP CONSTRAINT users_email_key;
  END IF;
END$$;

-- Ensure we still have a non-unique index on email for lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = current_schema()
      AND indexname = 'idx_users_email'
  ) THEN
    EXECUTE 'CREATE INDEX idx_users_email ON Users(email)';
  END IF;
END$$;

