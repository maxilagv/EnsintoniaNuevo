-- V15: Order status history (audit)

CREATE TABLE IF NOT EXISTS OrderStatusHistory (
  id SERIAL PRIMARY KEY,
  order_id INT NOT NULL REFERENCES Orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  old_status VARCHAR(50),
  new_status VARCHAR(50) NOT NULL,
  changed_by VARCHAR(255),
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_order_status_hist_order ON OrderStatusHistory(order_id);
CREATE INDEX IF NOT EXISTS idx_order_status_hist_changed_at ON OrderStatusHistory(changed_at);

