/**
 * Restaura las URLs originales de imágenes desde el export de Firebase (categories.json)
 * y las actualiza automáticamente en la base de datos PostgreSQL (Render o local).
 */

import fs from "fs";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();
dotenv.config({ path: "./backend/server/.env" });

const { Pool } = pg;

// 📦 Conexión a la base usando variables del .env (Render)
const pool = new Pool({
  host: process.env.PGHOST,
  port: process.env.PGPORT,
  database: process.env.PGDATABASE,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : false,
});

// 🧠 Leer el archivo JSON exportado desde Firebase
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const filePath = path.join(__dirname, "./exports/categories.json");

const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

async function restoreImages() {
  console.log("🚀 Restaurando imágenes desde Firebase export...\n");

  let totalUpdated = 0;

  for (const item of data) {
    const name = item.name?.trim();
    const url = item.imageUrl?.trim();

    if (!name || !url) {
      console.log(`⚠️  Saltado: entrada sin nombre o URL válida (${name})`);
      continue;
    }

    try {
      const result = await pool.query(
        `UPDATE categories SET image_url = $1 WHERE LOWER(name) = LOWER($2)`,
        [url, name]
      );

      if (result.rowCount > 0) {
        console.log(`✔️  ${name} → ${url}`);
        totalUpdated += result.rowCount;
      } else {
        console.log(`❌  No se encontró categoría para: ${name}`);
      }
    } catch (err) {
      console.error(`💥 Error actualizando ${name}: ${err.message}`);
    }
  }

  console.log(`\n✅ Proceso completado. ${totalUpdated} filas actualizadas.\n`);

  // 🔍 Mostrar resumen de las categorías con su imagen final
  try {
    const res = await pool.query("SELECT id, name, image_url FROM categories ORDER BY id");
    console.log("📋 Estado final de categorías:\n");
    res.rows.forEach((row) => {
      console.log(`${row.id} | ${row.name} | ${row.image_url}`);
    });
  } catch (err) {
    console.error("⚠️ No se pudo mostrar resumen final:", err.message);
  }

  await pool.end();
}

// Ejecutar
restoreImages().catch((err) => {
  console.error("❌ Error general:", err.message);
  pool.end();
});
