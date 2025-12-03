-- V29: Link Orders to seller user (commission owner)

ALTER TABLE Orders
  ADD COLUMN IF NOT EXISTS seller_user_id INT NULL;

ALTER TABLE Orders
  ADD CONSTRAINT fk_orders_seller_user
  FOREIGN KEY (seller_user_id) REFERENCES Users(id)
  ON UPDATE CASCADE
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_seller_user_id
  ON Orders(seller_user_id);

