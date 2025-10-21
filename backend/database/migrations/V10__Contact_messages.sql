-- =====================================================
-- V10__Contact_messages.sql
-- Crea la tabla ContactMessages para conservar mensajes de contacto
-- =====================================================

CREATE TABLE IF NOT EXISTS ContactMessages (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contactmessages_created_at ON ContactMessages(created_at);

