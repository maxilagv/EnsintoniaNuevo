#!/usr/bin/env node
/* Simple migration runner for PostgreSQL using SQL files */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../db/pg');

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      version VARCHAR(50) PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
}

function parseMigrationFilename(filename) {
  const m = /^V(\d+)__([\w\-]+)\.sql$/.exec(filename);
  if (!m) return null;
  return { version: m[1], name: m[2], filename };
}

async function getAppliedVersions() {
  const { rows } = await pool.query('SELECT version FROM _migrations');
  const set = new Set(rows.map(r => String(r.version)));
  return set;
}

async function run() {
  const defaultDir = path.resolve(__dirname, '../../database/migrations');
  const dir = process.env.DB_MIGRATIONS_DIR || defaultDir;
  const abs = path.resolve(dir);
  if (!fs.existsSync(abs)) {
    console.error(`No existe la carpeta de migraciones: ${abs}`);
    process.exit(1);
  }

  await ensureMigrationsTable();
  const applied = await getAppliedVersions();

  const files = fs
    .readdirSync(abs)
    .map(parseMigrationFilename)
    .filter(Boolean)
    .sort((a, b) => Number(a.version) - Number(b.version));

  for (const m of files) {
    if (applied.has(m.version)) {
      console.log(`SKIP V${m.version}__${m.name}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(abs, m.filename), 'utf8');
    console.log(`APPLY V${m.version}__${m.name}`);
    try {
      await pool.query('BEGIN');
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations(version, name) VALUES ($1, $2)', [m.version, m.name]);
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`Error en migración V${m.version}:`, err.message);
      process.exit(1);
    }
  }
  console.log('Migraciones aplicadas.');
  await pool.end();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
