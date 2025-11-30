-- V28: Link Orders to Clients via optional foreign key

ALTER TABLE Orders
  ADD COLUMN IF NOT EXISTS client_id INT NULL;

ALTER TABLE Orders
  ADD CONSTRAINT fk_orders_client
  FOREIGN KEY (client_id) REFERENCES Clients(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_client_id ON Orders(client_id);

