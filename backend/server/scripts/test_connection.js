import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/server/.env' });

const { Pool } = pkg;
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: { rejectUnauthorized: false },
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
