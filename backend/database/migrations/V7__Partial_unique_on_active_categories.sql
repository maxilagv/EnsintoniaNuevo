-- Ensure unique category names only for active (non-deleted) rows
-- 1) Drop old unique constraint created by the column-level UNIQUE
ALTER TABLE IF EXISTS categories DROP CONSTRAINT IF EXISTS categories_name_key;

-- 2) Create a partial unique index on LOWER(name) for active rows only
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'categories_unique_name_active_idx'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX categories_unique_name_active_idx ON categories ((LOWER(name))) WHERE deleted_at IS NULL';
  END IF;
END$$;

