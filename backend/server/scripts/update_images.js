// scripts/update_images.js
import pkg from 'pg';
import dotenv from 'dotenv';

dotenv.config(); // Para leer tu DATABASE_URL

const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// ======================================
// 1️⃣ IMÁGENES DE CATEGORÍAS
// ======================================
const categoryImages = {
  celulares: 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/celulares.png',
  'Aires acondicionados': 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/aires.png',
  hogar: 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/hogar.png',
  tv: 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/tv.png',
  'cosmeticos, perfumes y accesorios': 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/perfumes.png',
  electronica: 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/electronica.png',
  herramientas: 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/herramientas.png',
  'Insumos Impresoras': 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/impresoras.png',
  Entretenimiento: 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/entretenimiento.png',
  electrohogar: 'https://res.cloudinary.com/ensintonia/image/upload/v1/categories/electrohogar.png'
};

// ======================================
// 2️⃣ IMÁGENES DE PRODUCTOS (ejemplo inicial)
// ======================================
// Podés exportar tu JSON de productos desde Firebase o CSV y mapearlo acá.
const productImages = {
  'TV STICK PROGRAMADO': 'https://res.cloudinary.com/ensintonia/image/upload/v1/products/tv-stick.png',
  'SMART TV 50" (RCA--G50P6UHD)': 'https://res.cloudinary.com/ensintonia/image/upload/v1/products/rca-50.png',
  'FREIDORA DE AIRE 7.5 LITROS (AFR-1601)': 'https://res.cloudinary.com/ensintonia/image/upload/v1/products/freidora.png',
  // ...
};

// ======================================
// 3️⃣ FUNCIÓN DE ACTUALIZACIÓN MASIVA
// ======================================
async function updateImages() {
  try {
    console.log('🚀 Actualizando imágenes de categorías...');
    for (const [name, url] of Object.entries(categoryImages)) {
      const res = await pool.query('UPDATE categories SET image_url = $1 WHERE name = $2', [url, name]);
      console.log(`✔️  ${name} (${res.rowCount} fila/s actualizada/s)`);
    }

    console.log('\n🚀 Actualizando imágenes de productos...');
    for (const [name, url] of Object.entries(productImages)) {
      const res = await pool.query('UPDATE products SET image_url = $1 WHERE name = $2', [url, name]);
      console.log(`✔️  ${name} (${res.rowCount} fila/s actualizada/s)`);
    }

    console.log('\n✅ Todas las imágenes fueron actualizadas correctamente.');
  } catch (error) {
    console.error('❌ Error actualizando imágenes:', error.message);
  } finally {
    await pool.end();
  }
}

updateImages();
