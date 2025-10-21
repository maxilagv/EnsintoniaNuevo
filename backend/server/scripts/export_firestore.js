#!/usr/bin/env node
/*
  Exporta colecciones de Firestore a JSON sin tocar producción.
  Lee bajo artifacts/<APP_NS>/public/data/{categories,products,contact_messages}

  Requisitos:
  - Colocar serviceAccount.json en este directorio (credencial con permisos de lectura)
  - npm i firebase-admin

  Uso:
    APP_NS="mi-app" node scripts/export_firestore.js
    (opcional) EXPORTS_DIR=./exports_local APP_NS=mi-app node scripts/export_firestore.js
*/

const fs = require('fs/promises');
const path = require('path');
const admin = require('firebase-admin');

async function main() {
  const APP_NS = process.env.APP_NS || process.env.FIREBASE_APP_NS || 'default-app-id';
  const EXPORTS_DIR = path.resolve(process.env.EXPORTS_DIR || path.join(__dirname, 'exports'));
  const saPath = path.resolve(__dirname, 'serviceAccount.json');

  let serviceAccount;
  try {
    serviceAccount = require(saPath);
  } catch (e) {
    console.error('No se pudo leer serviceAccount.json en', saPath);
    console.error('Coloca el archivo de cuenta de servicio en scripts/ y reintenta.');
    process.exit(1);
  }

  if (admin.apps.length === 0) {
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  }
  const db = admin.firestore();

  const root = db.collection('artifacts').doc(APP_NS).collection('public').doc('data');

  async function dump(col, outName) {
    const snap = await root.collection(col).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    await fs.mkdir(EXPORTS_DIR, { recursive: true });
    const outFile = path.join(EXPORTS_DIR, `${outName}.json`);
    await fs.writeFile(outFile, JSON.stringify(items, null, 2));
    console.log(`Exportado ${items.length} -> ${outFile}`);
  }

  await dump('categories', 'categories');
  await dump('products', 'products');
  try {
    await dump('contact_messages', 'contact_messages');
  } catch (e) {
    console.warn('No se encontró contact_messages, continuando...');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

