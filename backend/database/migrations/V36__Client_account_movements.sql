-- V36: Payment condition on Orders + Client account movements

-- Nuevos campos en Orders para soportar cuenta corriente
ALTER TABLE Orders
  ADD COLUMN IF NOT EXISTS payment_condition VARCHAR(20) NOT NULL DEFAULT 'CONTADO';

ALTER TABLE Orders
  ADD COLUMN IF NOT EXISTS due_date DATE NULL;

ALTER TABLE Orders
  ADD COLUMN IF NOT EXISTS paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

ALTER TABLE Orders
  ADD COLUMN IF NOT EXISTS balance NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Solo permitimos condiciones conocidas por ahora
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint
     WHERE conname = 'chk_orders_payment_condition'
  ) THEN
    ALTER TABLE Orders
      ADD CONSTRAINT chk_orders_payment_condition
      CHECK (payment_condition IN ('CONTADO', 'CTA_CTE'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_orders_payment_condition
  ON Orders(payment_condition);

CREATE INDEX IF NOT EXISTS idx_orders_due_date
  ON Orders(due_date);

CREATE INDEX IF NOT EXISTS idx_orders_balance
  ON Orders(balance);

-- Tabla de movimientos de cuenta corriente por cliente
CREATE TABLE IF NOT EXISTS ClientAccountMovements (
  id SERIAL PRIMARY KEY,
  client_id INT NOT NULL REFERENCES Clients(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  order_id INT NULL REFERENCES Orders(id) ON UPDATE CASCADE ON DELETE SET NULL,
  movement_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  movement_type VARCHAR(20) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  created_by INT NULL REFERENCES Users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL,
  CONSTRAINT chk_clientacct_mov_type
    CHECK (movement_type IN ('DEBITO','CREDITO','AJUSTE'))
);

CREATE INDEX IF NOT EXISTS idx_clientacct_mov_client
  ON ClientAccountMovements(client_id);

CREATE INDEX IF NOT EXISTS idx_clientacct_mov_order
  ON ClientAccountMovements(order_id);

CREATE INDEX IF NOT EXISTS idx_clientacct_mov_date
  ON ClientAccountMovements(movement_date);

-- Triggers de updated_at y soft delete reutilizando funciones globales
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'trg_clientacct_mov_updated_at'
  ) THEN
    CREATE TRIGGER trg_clientacct_mov_updated_at
      BEFORE UPDATE ON ClientAccountMovements
      FOR EACH ROW
      EXECUTE FUNCTION fn_set_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger
     WHERE tgname = 'trg_clientacct_mov_soft_delete'
  ) THEN
    CREATE TRIGGER trg_clientacct_mov_soft_delete
      BEFORE DELETE ON ClientAccountMovements
      FOR EACH ROW
      EXECUTE FUNCTION fn_soft_delete();
  END IF;
END$$;

