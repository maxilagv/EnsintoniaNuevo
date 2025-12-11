#!/usr/bin/env node
const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../db/pg');

async function upsertPermission(name, description = null) {
  const sel = await query('SELECT id FROM Permissions WHERE name = $1', [name]);
  if (sel.rows.length) return sel.rows[0].id;
  const ins = await query('INSERT INTO Permissions(name, description) VALUES ($1,$2) RETURNING id', [name, description]);
  return ins.rows[0].id;
}

async function upsertProfile(name, description = null) {
  const sel = await query('SELECT id FROM Profiles WHERE name = $1 AND deleted_at IS NULL', [name]);
  if (sel.rows.length) return sel.rows[0].id;
  const ins = await query('INSERT INTO Profiles(name, description) VALUES ($1,$2) RETURNING id', [name, description]);
  return ins.rows[0].id;
}

async function upsertRole(name, description = null) {
  const sel = await query('SELECT id FROM Roles WHERE name = $1 AND deleted_at IS NULL', [name]);
  if (sel.rows.length) return sel.rows[0].id;
  const ins = await query('INSERT INTO Roles(name, description) VALUES ($1,$2) RETURNING id', [name, description]);
  return ins.rows[0].id;
}

async function upsertUser(email, name, username = null, department = null, position = null, tempPassword = 'Temp#2025') {
  const sel = await query('SELECT id FROM Users WHERE LOWER(email) = $1 AND deleted_at IS NULL', [String(email).toLowerCase()]);
  if (sel.rows.length) return sel.rows[0].id;
  const hash = await bcrypt.hash(tempPassword, Number(process.env.BCRYPT_ROUNDS || 10));
  const ins = await query(
    `INSERT INTO Users(email, username, password_hash, name, department, position, status, must_change_password)
     VALUES ($1,$2,$3,$4,$5,$6,'ACTIVE',TRUE) RETURNING id`,
    [String(email).toLowerCase(), username ? String(username).toLowerCase() : null, hash, name, department, position]
  );
  const userId = ins.rows[0].id;
  await query('INSERT INTO PasswordHistory(user_id, password_hash) VALUES ($1,$2)', [userId, hash]);
  return userId;
}

async function ensureProfilePermissions(profileId, permNames) {
  await query('DELETE FROM ProfilePermissions WHERE profile_id = $1', [profileId]);
  for (const n of permNames) {
    const pid = await upsertPermission(n);
    await query('INSERT INTO ProfilePermissions(profile_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [profileId, pid]);
  }
}

async function assignPrimaryProfile(userId, profileId) {
  await query('DELETE FROM UserProfiles WHERE user_id = $1 AND is_primary = TRUE', [userId]);
  await query('INSERT INTO UserProfiles(user_id, profile_id, is_primary) VALUES ($1,$2,TRUE) ON CONFLICT (user_id, profile_id) DO UPDATE SET is_primary = EXCLUDED.is_primary', [userId, profileId]);
}

async function main() {
  const modules = ['ventas', 'logistica', 'rrhh', 'compras', 'administracion'];
  const actions = ['read', 'write', 'delete'];
  for (const m of modules) {
    for (const a of actions) {
      await upsertPermission(`${m}.${a}`);
    }
  }
  // extras
  await upsertPermission('ventas.approve');
  await upsertPermission('administracion.configure');
  await upsertPermission('administracion.read');
  // ABM users granular
  await upsertPermission('administracion.users.read');
  await upsertPermission('administracion.users.write');
  await upsertPermission('administracion.users.delete');
  await upsertPermission('administracion.users.configure');

  // Profiles per area
  const profiles = [];
  async function mkProfile(name, permNames) {
    const pid = await upsertProfile(name);
    await ensureProfilePermissions(pid, permNames);
    profiles.push({ id: pid, name });
    return pid;
  }

  await mkProfile('VENTAS_RO', ['ventas.read']);
  await mkProfile('VENTAS_RW', ['ventas.read', 'ventas.write']);
  await mkProfile('VENTAS_RWD', ['ventas.read', 'ventas.write', 'ventas.delete']);
  await mkProfile('VENTAS_APPROVER', ['ventas.approve']);

  await mkProfile('LOGISTICA_RO', ['logistica.read']);
  await mkProfile('LOGISTICA_RW', ['logistica.read', 'logistica.write', 'ventas.read', 'ventas.write']);
  await mkProfile('LOGISTICA_RWD', ['logistica.read', 'logistica.write', 'logistica.delete', 'ventas.read', 'ventas.write']);

  await mkProfile('RRHH_RO', ['rrhh.read']);
  await mkProfile('RRHH_RW', ['rrhh.read', 'rrhh.write']);
  await mkProfile('RRHH_RWD', ['rrhh.read', 'rrhh.write', 'rrhh.delete']);

  await mkProfile('COMPRAS_RO', ['compras.read']);
  await mkProfile('COMPRAS_RW', ['compras.read', 'compras.write']);
  await mkProfile('COMPRAS_RWD', ['compras.read', 'compras.write', 'compras.delete']);

  await mkProfile('ADMIN_GESTION_USUARIOS', [
    'administracion.read',
    'administracion.users.read',
    'administracion.users.write',
    'administracion.users.delete',
    'administracion.users.configure'
  ]);

  // Optional role superadmin with wildcard via convention
  const superadminRoleId = await upsertRole('superadmin', 'Acceso total por convención');
  // Grant some umbrella perms (wildcards represented as names too)
  for (const ns of ['ventas.*','logistica.*','rrhh.*','compras.*','administracion.*']) {
    const pid = await upsertPermission(ns);
    await query('INSERT INTO RolePermissions(role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [superadminRoleId, pid]);
  }

  // Default roles
  async function ensureRoleWithPerms(name, permNames, description = null) {
    const rid = await upsertRole(name, description);
    for (const n of permNames) {
      const pid = await upsertPermission(n);
      await query('INSERT INTO RolePermissions(role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [rid, pid]);
    }
    return rid;
  }

  const roleAdminCompleto = await ensureRoleWithPerms('ADMIN_COMPLETO', [
    'ventas.*','logistica.*','compras.*','rrhh.*','administracion.*'
  ], 'Acceso total');

  const roleLogisticaRO = await ensureRoleWithPerms('LOGISTICA_RO', [
    'logistica.read'
  ], 'Logística solo lectura');

  const roleLogisticaRW = await ensureRoleWithPerms('LOGISTICA_RW', [
    'logistica.read','logistica.write','logistica.delete','ventas.read','ventas.write'
  ], 'Logística edición');

  const roleVentasAdmin = await ensureRoleWithPerms('VENTAS_ADMIN', [
    'ventas.read','ventas.write','ventas.delete'
  ], 'Ventas administrador');

  const roleDepositoRO = await ensureRoleWithPerms('DEPOSITO_RO', [
    'logistica.read'
  ], 'Depósito solo lectura');

  // Users @example.com
  const uVentas = await upsertUser('ventas.qa1@example.com', 'Ventas QA 1', 'ventas.qa1', 'Ventas', 'Ejecutivo');
  const uLog = await upsertUser('logistica.qa1@example.com', 'Logística QA 1', 'logistica.qa1', 'Logística', 'Operador');
  const uRRHH = await upsertUser('rrhh.qa1@example.com', 'RRHH QA 1', 'rrhh.qa1', 'RRHH', 'Analista');
  const uCompras = await upsertUser('compras.qa1@example.com', 'Compras QA 1', 'compras.qa1', 'Compras', 'Comprador');
  const uAdminOps = await upsertUser('admin.ops@example.com', 'Admin Ops', 'admin.ops', 'Administración', 'Operador');

  // Assign primary profiles
  async function profileIdByName(name) {
    const { rows } = await query('SELECT id FROM Profiles WHERE name = $1', [name]);
    return rows[0]?.id;
  }
  await assignPrimaryProfile(uVentas, await profileIdByName('VENTAS_RW'));
  await assignPrimaryProfile(uLog, await profileIdByName('LOGISTICA_RW'));
  await assignPrimaryProfile(uRRHH, await profileIdByName('RRHH_RW'));
  await assignPrimaryProfile(uCompras, await profileIdByName('COMPRAS_RW'));
  await assignPrimaryProfile(uAdminOps, await profileIdByName('ADMIN_GESTION_USUARIOS'));

  console.log('Seed RBAC completado.');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
