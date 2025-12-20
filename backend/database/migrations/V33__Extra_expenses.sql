-- V33: Extra expenses for finance module

CREATE TABLE IF NOT EXISTS ExtraExpenses (
  id SERIAL PRIMARY KEY,
  expense_date TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  category VARCHAR(100),
  notes TEXT,
  created_by INT NULL REFERENCES Users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE INDEX IF NOT EXISTS idx_extraexpenses_date ON ExtraExpenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_extraexpenses_category ON ExtraExpenses(category);
CREATE INDEX IF NOT EXISTS idx_extraexpenses_created_by ON ExtraExpenses(created_by);

CREATE TRIGGER trg_extraexpenses_updated_at
  BEFORE UPDATE ON ExtraExpenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_extraexpenses_soft_delete
  BEFORE DELETE ON ExtraExpenses
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

