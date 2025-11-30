-- V27: Link Users to Clients via optional foreign key

ALTER TABLE Users
  ADD COLUMN IF NOT EXISTS client_id INT NULL;

ALTER TABLE Users
  ADD CONSTRAINT fk_users_client
  FOREIGN KEY (client_id) REFERENCES Clients(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_users_client_id ON Users(client_id);

