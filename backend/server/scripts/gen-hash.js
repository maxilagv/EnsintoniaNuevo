#!/usr/bin/env node
const bcrypt = require('bcryptjs');

async function main() {
  const pwd = process.argv[2];
  const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
  if (!pwd) {
    console.error('Uso: node scripts/gen-hash.js "MiContraseñaSegura"');
    process.exit(1);
  }
  const hash = await bcrypt.hash(pwd, rounds);
  console.log(hash);
}

main();

