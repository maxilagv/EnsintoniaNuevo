-- V12: Persist refresh tokens for rotation + revocation

CREATE TABLE IF NOT EXISTS RefreshTokens (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  jti VARCHAR(128) NOT NULL UNIQUE,
  token_hash VARCHAR(255) NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address VARCHAR(64),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_used_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  revoked_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_email ON RefreshTokens(email);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_active ON RefreshTokens(email)
  WHERE revoked_at IS NULL;

