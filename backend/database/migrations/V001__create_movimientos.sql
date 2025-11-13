-- Movimientos de stock y flujo de dinero (compras/ventas)
CREATE TABLE IF NOT EXISTS movimientos (
  id SERIAL PRIMARY KEY,
  tipo VARCHAR(10) CHECK (tipo IN ('compra', 'venta')),
  producto_id INTEGER REFERENCES products(id),
  cantidad INTEGER NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(12,2) NOT NULL,
  total NUMERIC(14,2) GENERATED ALWAYS AS (cantidad * precio_unitario) STORED,
  fecha TIMESTAMP DEFAULT NOW(),
  usuario VARCHAR(100),
  nota TEXT
);

CREATE INDEX IF NOT EXISTS idx_movimientos_fecha ON movimientos(fecha);
CREATE INDEX IF NOT EXISTS idx_movimientos_producto ON movimientos(producto_id);
CREATE INDEX IF NOT EXISTS idx_movimientos_tipo ON movimientos(tipo);

