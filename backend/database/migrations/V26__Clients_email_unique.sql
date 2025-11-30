-- V26: Unique email on Clients (case-insensitive, only active/non-deleted)

CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_email
  ON Clients((LOWER(email)))
  WHERE email IS NOT NULL
    AND deleted_at IS NULL;

