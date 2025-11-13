-- V20: Password history and security events

CREATE TABLE IF NOT EXISTS PasswordHistory (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_pwdhist_user ON PasswordHistory(user_id);

CREATE TABLE IF NOT EXISTS SecurityEvents (
  id SERIAL PRIMARY KEY,
  user_id INT,
  ip VARCHAR(64),
  user_agent TEXT,
  event_type VARCHAR(100) NOT NULL,
  meta JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES Users(id) ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_secev_user ON SecurityEvents(user_id);
CREATE INDEX IF NOT EXISTS idx_secev_event ON SecurityEvents(event_type);

