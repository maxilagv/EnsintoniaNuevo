/**
 * Migra el campo "specifications" desde el export JSON de Firebase a la base SQL.
 * Soporta especificaciones en formato array [{key, value}] o texto simple.
 */

import fs from "fs";
import { pool } from "../db/pg.js";
import dotenv from "dotenv";
import { fileURLToPath } from "url";
import path from "path";

// ✅ Cargar variables de entorno
dotenv.config({ path: "./backend/server/.env" });

// Calcular ruta del archivo actual
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ruta del JSON de productos exportado desde Firebase
const filePath = path.join(__dirname, "./exports/products.json");
const data = JSON.parse(fs.readFileSync(filePath, "utf8"));

async function migrateSpecifications() {
  console.log("🚀 Migrando especificaciones de productos...\n");

  let total = 0;
  let skipped = 0;

  for (const item of data) {
    const name = item.name?.trim();
    let specs = null;

    if (Array.isArray(item.specifications) && item.specifications.length > 0) {
      specs = item.specifications
        .map(s => s.key || "")
        .filter(Boolean)
        .join(" ")
        .trim();
    } else if (typeof item.specifications === "string") {
      specs = item.specifications.trim();
    }

    if (!name || !specs) {
      skipped++;
      continue;
    }

    try {
      const result = await pool.query(
        `UPDATE products SET specifications = $1 WHERE LOWER(name) = LOWER($2)`,
        [specs, name]
      );

      if (result.rowCount > 0) {
        console.log(`✔️  ${name} → ${specs.substring(0, 60)}...`);
        total++;
      } else {
        console.log(`⚠️  No se encontró producto con nombre: ${name}`);
      }
    } catch (err) {
      console.error(`💥 Error actualizando ${name}: ${err.message}`);
    }
  }

  console.log(`\n✅ Migración completada.`);
  console.log(`   🟢 Productos actualizados: ${total}`);
  console.log(`   ⚪ Productos saltados: ${skipped}`);
  await pool.end();
}

migrateSpecifications().catch((err) => {
  console.error("❌ Error general:", err.message);
  pool.end();
});
