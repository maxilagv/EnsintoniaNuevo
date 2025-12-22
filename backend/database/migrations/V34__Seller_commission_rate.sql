-- V34: Per-user seller commission rate

ALTER TABLE IF EXISTS Users
  ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(6,4);

