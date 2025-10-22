/**
 * Verifica y actualiza las imágenes rotas en la base de datos.
 * - Comprueba si las URLs devuelven HTTP 200.
 * - Informa cuáles están rotas.
 * - Permite reemplazarlas automáticamente con nuevas URLs (Cloudinary o PostImage).
 */

import pg from "pg";
import fetch from "node-fetch";
import dotenv from "dotenv";
import readline from "readline";

dotenv.config();
const { Pool } = pg;

// ============================================
// 🧩 Configuración de conexión
// ============================================
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/ensintonia",
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

// ============================================
// ⚙️ Helpers
// ============================================
async function checkImage(url) {
  if (!url) return false;
  try {
    const res = await fetch(url, { method: "HEAD" });
    return res.ok;
  } catch {
    return false;
  }
}

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (ans) => {
    rl.close();
    resolve(ans.trim());
  }));
}

// ============================================
// 🔍 Verificar categorías y productos
// ============================================
async function verifyTable(table, column = "image_url", nameCol = "name") {
  console.log(`\n🔍 Verificando imágenes en tabla "${table}"...`);
  const res = await pool.query(`SELECT id, ${nameCol}, ${column} FROM ${table} ORDER BY id`);
  const rows = res.rows;

  const broken = [];
  for (const row of rows) {
    const ok = await checkImage(row[column]);
    if (!ok) {
      console.log(`❌ Rota: [${row.id}] ${row[nameCol]} (${row[column] || "sin URL"})`);
      broken.push(row);
    } else {
      console.log(`✅ OK: ${row[nameCol]}`);
    }
  }

  if (!broken.length) {
    console.log(`\n✅ Todas las imágenes de "${table}" están correctas.`);
    return;
  }

  console.log(`\n⚠️ ${broken.length} imágenes rotas encontradas en "${table}".`);
  const fix = await ask("¿Querés reemplazarlas manualmente ahora? (s/n): ");
  if (fix.toLowerCase() === "s") {
    for (const row of broken) {
      const newUrl = await ask(`Nueva URL para "${row[nameCol]}" (Enter para omitir): `);
      if (newUrl) {
        await pool.query(`UPDATE ${table} SET ${column} = $1 WHERE id = $2`, [newUrl, row.id]);
        console.log(`✔️ Actualizada: ${row[nameCol]}`);
      }
    }
  }
}

// ============================================
// 🚀 Ejecutar verificación completa
// ============================================
(async () => {
  try {
    await verifyTable("categories");
    await verifyTable("products");
    console.log("\n✨ Verificación finalizada.");
  } catch (err) {
    console.error("❌ Error en el script:", err.message);
  } finally {
    await pool.end();
  }
})();
