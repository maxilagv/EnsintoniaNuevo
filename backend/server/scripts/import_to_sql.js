#!/usr/bin/env node
const fs = require('fs/promises');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });
const { Client } = require('pg');

const EXPORTS_DIR = path.resolve(process.env.EXPORTS_DIR || path.join(__dirname, 'exports'));

async function readJson(name) {
  try {
    const raw = await fs.readFile(path.join(EXPORTS_DIR, `${name}.json`), 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    console.error(`⚠️ No se pudo leer ${name}.json:`, e.message);
    return [];
  }
}

function nowIso() { return new Date().toISOString(); }

async function tableExists(client, tableName) {
  const { rows } = await client.query(`SELECT to_regclass($1) AS reg`, [tableName]);
  return !!(rows[0] && rows[0].reg);
}

async function main() {
  const client = new Client({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    database: process.env.PGDATABASE || 'postgres',
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD,
    ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });

  await client.connect();

  const categories = await readJson('categories');
  const products = await readJson('products');
  const messages = await readJson('contact_messages');

  console.log(`🔍 Archivos leídos: ${categories.length} categorías, ${products.length} productos, ${messages.length} mensajes.`);

  const hasProductImages = await tableExists(client, 'productimages');
  const hasContactMessages = await tableExists(client, 'contactmessages');
  const categoryIdByKey = new Map();

  async function upsertCategoryByName(c) {
    const name = (c.name || '').trim();
    if (!name) return null;
    const description = c.description ?? null;
    const deletedAt = (c.active === false || c.enabled === false) ? nowIso() : null;

    try {
      const { rows } = await client.query(
        `INSERT INTO categories(name, description, deleted_at)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET description = EXCLUDED.description
         RETURNING id`,
        [name, description, deletedAt]
      );
      return rows[0];
    } catch (e) {
      console.error("⚠️ Error upsert categoría:", e.message);
      return null;
    }
  }

  const resolveCategoryId = async (p) => {
    const key = (
      (p.category && (p.category.id || p.category.name)) ||
      p.category || p.categoryName || p.category_name || ''
    ).toString().trim();
    if (!key) return null;
    if (categoryIdByKey.has(key)) return categoryIdByKey.get(key);

    const q = await client.query('SELECT id FROM categories WHERE name = $1 LIMIT 1', [key]);
    if (q.rowCount) {
      categoryIdByKey.set(key, q.rows[0].id);
      return q.rows[0].id;
    }

    const created = await upsertCategoryByName({ name: key });
    if (created) {
      categoryIdByKey.set(key, created.id);
      return created.id;
    }
    return null;
  };

  // ✅ Insertar categorías
  for (const c of categories) {
    if (!c || !c.name) continue;
    try {
      await client.query(
        `INSERT INTO categories (name, description, deleted_at)
         VALUES ($1, $2, NULL)
         ON CONFLICT (name) DO NOTHING;`,
        [c.name.trim(), c.description || null]
      );
    } catch (err) {
      console.error("⚠️ Error insertando categoría:", err.message);
    }
  }

  // ✅ Insertar productos
  for (const p of products) {
    const name = (p?.name || '').trim();
    if (!name) continue;
    const description = p.description ?? null;
    const price = Number(p.price ?? 0);
    const imageUrl = p.image || p.imageUrl || null;
    const deletedAt = (p.active === false || p.enabled === false) ? nowIso() : null;
    const categoryId = await resolveCategoryId(p);
    const initialStock = Number.isFinite(Number(p.stock)) ? Number(p.stock) : 0;

    try {
      await client.query(
        `INSERT INTO products (category_id, name, image_url, description, price, stock_quantity, deleted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (name) DO NOTHING;`,
        [categoryId, name, imageUrl, description, price, initialStock, deletedAt]
      );
      console.log(`✅ Producto insertado: ${name}`);
    } catch (e) {
      console.error(`⚠️ Error con ${name}:`, e.message);
    }
  }

  // ✅ Mensajes de contacto
 // ✅ Mensajes de contacto (corregido)
if (hasContactMessages && Array.isArray(messages) && messages.length) {
  for (const m of messages) {
    const name = m.name || m.fullName || '';
    const email = m.email || '';
    const phone = m.phone || null;
    const subject = m.subject || null;
    const message = m.message || '';

    // Conversión de timestamp Firebase → ISO
    let createdAt = nowIso();
    if (m.createdAt?._seconds) {
      createdAt = new Date(m.createdAt._seconds * 1000).toISOString();
    }

    try {
      await client.query(
        `INSERT INTO contactmessages(name, email, phone, subject, message, created_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT DO NOTHING;`,
        [name, email, phone, subject, message, createdAt]
      );
      console.log(`✅ Mensaje insertado de ${name}`);
    } catch (err) {
      console.error('⚠️ Error insertando mensaje:', err.message);
    }
  }
}


  // ✅ Confirmar inserciones
  const { rows } = await client.query('SELECT COUNT(*) AS categorias FROM categories;');
  const { rows: rows2 } = await client.query('SELECT COUNT(*) AS productos FROM products;');
  console.log(`🎯 En base ahora hay ${rows[0].categorias} categorías y ${rows2[0].productos} productos.`);

  await client.end();
  console.log('✅ Importación completada y confirmada.');
}

main().catch((e) => {
  console.error('❌ Error crítico en importación:', e);
  process.exit(1);
});
