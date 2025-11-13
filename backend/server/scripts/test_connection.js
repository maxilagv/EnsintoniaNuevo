import pkg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: './backend/server/.env' });

const { Pool } = pkg;

const useSSL = process.env.PGSSL === 'true' || process.env.NODE_ENV === 'production';
let ssl = useSSL ? { rejectUnauthorized: true } : false;
const caInline = process.env.PGSSL_CA || process.env.PG_CA;
const caFile = process.env.PGSSL_CA_FILE || process.env.PG_CA_FILE;
if (useSSL) {
  if (caInline && caInline.trim()) {
    ssl = { rejectUnauthorized: true, ca: caInline };
  } else if (caFile) {
    try { ssl = { rejectUnauthorized: true, ca: fs.readFileSync(caFile, 'utf8') }; } catch {}
  }
}

const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl,
});

(async () => {
  try {
    const res = await pool.query('SELECT NOW()');
    console.log('✅ Conexión exitosa:', res.rows[0].now);
  } catch (err) {
    console.error('❌ Error de conexión:', err.message);
  } finally {
    await pool.end();
  }
})();
