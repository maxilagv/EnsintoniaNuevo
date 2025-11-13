-- V21: User requests approval workflow

CREATE TYPE user_request_status AS ENUM (
  'REQUESTED',
  'RRHH_REVIEWED',
  'MANAGER_APPROVED',
  'IT_ASSIGNED',
  'ACTIVATED',
  'REJECTED'
);

CREATE TABLE IF NOT EXISTS UserRequests (
  id SERIAL PRIMARY KEY,
  requester_email VARCHAR(255) NOT NULL,
  target_email VARCHAR(255) NOT NULL,
  payload JSONB, -- requested profiles/roles and fields
  status user_request_status NOT NULL DEFAULT 'REQUESTED',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP DEFAULT NULL
);

CREATE TRIGGER trg_userrequests_updated_at
  BEFORE UPDATE ON UserRequests
  FOR EACH ROW
  EXECUTE FUNCTION fn_set_updated_at();

CREATE TRIGGER trg_userrequests_soft_delete
  BEFORE DELETE ON UserRequests
  FOR EACH ROW
  EXECUTE FUNCTION fn_soft_delete();

CREATE TABLE IF NOT EXISTS UserRequestActions (
  id SERIAL PRIMARY KEY,
  request_id INT NOT NULL,
  actor VARCHAR(255),
  action VARCHAR(100) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id) REFERENCES UserRequests(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_userrequests_status ON UserRequests(status);
