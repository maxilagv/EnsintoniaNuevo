-- V17: Extend Users with fields for ABM and security

-- Username unique (case-insensitive, only for active users)
ALTER TABLE IF EXISTS Users
  ADD COLUMN IF NOT EXISTS username VARCHAR(150);

-- Basic org fields
ALTER TABLE IF EXISTS Users
  ADD COLUMN IF NOT EXISTS department VARCHAR(150),
  ADD COLUMN IF NOT EXISTS position VARCHAR(150);

-- Account state and lifecycle
ALTER TABLE IF EXISTS Users
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP DEFAULT NULL;

-- Password policy
ALTER TABLE IF EXISTS Users
  ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS password_changed_at TIMESTAMP DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS password_expires_at TIMESTAMP DEFAULT NULL;

-- MFA flags
ALTER TABLE IF EXISTS Users
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

-- Lockout
ALTER TABLE IF EXISTS Users
  ADD COLUMN IF NOT EXISTS failed_attempts INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMP DEFAULT NULL;

-- Unique indexes and lookups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'users_username_unique_active_idx'
  ) THEN
    EXECUTE 'CREATE UNIQUE INDEX users_username_unique_active_idx ON Users ((LOWER(username))) WHERE deleted_at IS NULL';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_users_status'
  ) THEN
    EXECUTE 'CREATE INDEX idx_users_status ON Users(status)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_users_expires_at'
  ) THEN
    EXECUTE 'CREATE INDEX idx_users_expires_at ON Users(expires_at)';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'idx_users_locked_until'
  ) THEN
    EXECUTE 'CREATE INDEX idx_users_locked_until ON Users(locked_until)';
  END IF;
END$$;

