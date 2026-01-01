const { Pool } = require('pg');
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');

// Intentar cargar .env local del backend/server si existe
try {
  dotenv.config({ path: path.resolve(__dirname, '../.env') });
} catch (_) {}

// SSL seguro para Postgres
function buildSslConfig() {
  const useSSL = process.env.PGSSL === 'true' || process.env.NODE_ENV === 'production';
  if (!useSSL) return undefined;

  // Preferir CA provista por entorno
  const caInline = process.env.PGSSL_CA || process.env.PG_CA;
  const caFile = process.env.PGSSL_CA_FILE || process.env.PG_CA_FILE;
  let ca = undefined;
  if (caInline && caInline.trim()) {
    ca = caInline;
  } else if (caFile) {
    try {
      ca = fs.readFileSync(path.resolve(caFile), 'utf8');
    } catch (_) { /* ignore read error, fall back to system CAs */ }
  }

  // Por defecto, validar certificados del servidor (mitiga MITM)
  const reject = String(process.env.PGSSL_REJECT_UNAUTHORIZED || '').toLowerCase();
  const rejectUnauthorized = reject === 'false' ? false : true;

  return ca ? { rejectUnauthorized, ca } : { rejectUnauthorized };
}

// Crear conexión
const pool = new Pool({
  host: process.env.PGHOST,
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: buildSslConfig(),
});

async function query(text, params) {
  return pool.query(text, params);
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    // Log centralizado de errores en transacciones (incluye errores de SQL)
    console.error('withTransaction error:', err);
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, query, withTransaction };
