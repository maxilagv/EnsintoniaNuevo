#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

async function main() {
  const pwd = process.argv[2];
  const email = process.argv[3];
  if (!pwd) {
    console.error('Uso: node scripts/set-admin-password.js "MiContraseñaSegura" [email@dominio]');
    process.exit(1);
  }
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  const hash = await bcrypt.hash(pwd, rounds);

  const envPath = path.resolve(__dirname, '..', '.env');
  if (!fs.existsSync(envPath)) {
    console.error('No se encontró .env en el servidor.');
    process.exit(1);
  }
  let content = fs.readFileSync(envPath, 'utf8');

  // Reemplazar/insertar ADMIN_PASSWORD_HASH
  if (/^ADMIN_PASSWORD_HASH=.*$/m.test(content)) {
    content = content.replace(/^ADMIN_PASSWORD_HASH=.*$/m, `ADMIN_PASSWORD_HASH=${hash}`);
  } else {
    content += `\nADMIN_PASSWORD_HASH=${hash}\n`;
  }

  // Opcional: actualizar email si se pasa
  if (email) {
    if (/^ADMIN_EMAIL=.*$/m.test(content)) {
      content = content.replace(/^ADMIN_EMAIL=.*$/m, `ADMIN_EMAIL=${email}`);
    } else {
      content += `ADMIN_EMAIL=${email}\n`;
    }
  }

  fs.writeFileSync(envPath, content, 'utf8');
  console.log('ADMIN_PASSWORD_HASH actualizado en .env');
  if (email) console.log('ADMIN_EMAIL actualizado en .env');
}

main().catch((e) => { console.error(e); process.exit(1); });

