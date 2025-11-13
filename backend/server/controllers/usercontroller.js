const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../db/pg');
const { audit } = require('../utils/audit');

function normStr(v) { return (v == null ? null : String(v).trim()); }
function normLower(v) { return (v == null ? null : String(v).trim().toLowerCase()); }

async function createUser(req, res) {
  const body = req.body || {};
  const email = normLower(body.email);
  const username = body.username ? normLower(body.username) : null;
  const name = normStr(body.name);
  const department = normStr(body.department);
  const position = normStr(body.position);
  const status = (body.status || 'ACTIVE').toUpperCase();
  const tempPassword = normStr(body.tempPassword) || 'Temp#2025';
  const mustChange = body.must_change_password !== false; // default true
  const profiles = Array.isArray(body.profiles) ? body.profiles : [];
  const roles = Array.isArray(body.roles) ? body.roles : [];
  const expiresAt = body.expiresAt ? new Date(body.expiresAt) : null;

  if (!email || !name) return res.status(400).json({ error: 'email y name requeridos' });

  try {
    // Pre-chequeos de unicidad para error claro
    const existsEmail = await query('SELECT 1 FROM Users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1', [email]);
    if (existsEmail.rows.length) return res.status(409).json({ error: 'El email ya existe' });
    if (username) {
      const existsUser = await query('SELECT 1 FROM Users WHERE LOWER(username) = $1 AND deleted_at IS NULL LIMIT 1', [username]);
      if (existsUser.rows.length) return res.status(409).json({ error: 'El nombre de usuario ya existe' });
    }

    const result = await withTransaction(async (client) => {
      const password_hash = await bcrypt.hash(tempPassword, Number(process.env.BCRYPT_ROUNDS || 10));
      const ins = await client.query(
        `INSERT INTO Users(email, username, password_hash, name, department, position, status, must_change_password, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [email, username, password_hash, name, department, position, status, mustChange, expiresAt]
      );
      const userId = ins.rows[0].id;
      await client.query('INSERT INTO PasswordHistory(user_id, password_hash) VALUES ($1,$2)', [userId, password_hash]);

      if (profiles.length) {
        for (const p of profiles) {
          const pid = Number(p);
          if (Number.isInteger(pid) && pid > 0) {
            await client.query('INSERT INTO UserProfiles(user_id, profile_id, is_primary) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [userId, pid, false]);
          }
        }
      }
      if (roles.length) {
        for (const r of roles) {
          const rid = Number(r);
          if (Number.isInteger(rid) && rid > 0) {
            await client.query('INSERT INTO UserRoles(user_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, rid]);
          }
        }
      }
      return userId;
    });
    await audit(req.user && req.user.email, 'USER_CREATE', 'user', result, { email });
    return res.status(201).json({ id: result });
  } catch (e) {
    // Mensajes de error más claros
    if (e && e.code === '23505') {
      const detail = String(e.detail || '').toLowerCase();
      if (detail.includes('email')) return res.status(409).json({ error: 'El email ya existe' });
      if (detail.includes('username')) return res.status(409).json({ error: 'El nombre de usuario ya existe' });
      return res.status(409).json({ error: 'Registro duplicado' });
    }
    if (e && (e.code === '42P01' || e.code === '42703')) {
      return res.status(500).json({ error: 'Esquema desactualizado. Ejecuta migraciones (npm run migrate).' });
    }
    console.error('[users] create error:', e.message);
    return res.status(500).json({ error: 'Error creando usuario' });
  }
}

async function listUsers(req, res) {
  const q = normLower(req.query.q);
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  const dept = normStr(req.query.dept);
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const size = Math.min(100, Math.max(1, parseInt(req.query.size || '20', 10)));
  const offset = (page - 1) * size;

  const where = ['deleted_at IS NULL'];
  const args = [];
  if (status) { args.push(status); where.push(`status = $${args.length}`); }
  if (dept) { args.push(dept); where.push(`department = $${args.length}`); }
  if (q) {
    args.push(`%${q}%`);
    where.push(`(LOWER(email) LIKE $${args.length} OR LOWER(username) LIKE $${args.length} OR LOWER(name) LIKE $${args.length})`);
  }
  const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';
  try {
    const { rows } = await query(
      `SELECT id, email, username, name, department, position, status, created_at, updated_at
         FROM Users ${whereSql}
        ORDER BY id DESC
        LIMIT ${size} OFFSET ${offset}`,
      args
    );
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudieron listar usuarios' });
  }
}

async function getUser(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await query('SELECT id, email, username, name, department, position, status, created_at, updated_at FROM Users WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const user = rows[0];
    const profiles = await query(
      `SELECT p.id, p.name, up.is_primary, up.expires_at
         FROM UserProfiles up JOIN Profiles p ON p.id = up.profile_id
        WHERE up.user_id = $1`, [id]);
    const roles = await query(
      `SELECT r.id, r.name FROM UserRoles ur JOIN Roles r ON r.id = ur.role_id WHERE ur.user_id = $1`, [id]);
    user.profiles = profiles.rows;
    user.roles = roles.rows;
    return res.json(user);
  } catch (e) {
    return res.status(500).json({ error: 'Error obteniendo usuario' });
  }
}

async function updateUser(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  const body = req.body || {};
  const fields = [];
  const args = [];
  function add(field, val, transform = (x)=>x) {
    if (val !== undefined) { args.push(transform(val)); fields.push(`${field} = $${args.length}`); }
  }
  add('email', body.email, v => normLower(v));
  add('username', body.username, v => normLower(v));
  add('name', body.name, v => normStr(v));
  add('department', body.department, v => normStr(v));
  add('position', body.position, v => normStr(v));
  add('status', body.status, v => String(v).toUpperCase());
  add('expires_at', body.expiresAt, v => (v ? new Date(v) : null));
  if (!fields.length) return res.status(400).json({ error: 'Sin cambios' });
  args.push(id);
  try {
    const r = await query(`UPDATE Users SET ${fields.join(', ')} WHERE id = $${args.length} AND deleted_at IS NULL`, args);
    if (!r.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
    await audit(req.user && req.user.email, 'USER_UPDATE', 'user', id, { changes: Object.keys(body || {}) });
    return res.json({ updated: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo actualizar' });
  }
}

async function updateStatus(req, res) {
  const id = Number(req.params.id);
  const active = !!(req.body && req.body.active);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const status = active ? 'ACTIVE' : 'INACTIVE';
    const r = await query('UPDATE Users SET status = $1 WHERE id = $2 AND deleted_at IS NULL', [status, id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
    await audit(req.user && req.user.email, active ? 'USER_ACTIVATE' : 'USER_DEACTIVATE', 'user', id, null);
    return res.json({ active });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo cambiar el estado' });
  }
}

async function resetPassword(req, res) {
  const id = Number(req.params.id);
  const tempPassword = normStr(req.body && req.body.tempPassword) || 'Temp#2025';
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const hash = await bcrypt.hash(tempPassword, Number(process.env.BCRYPT_ROUNDS || 10));
    const r = await query('UPDATE Users SET password_hash = $1, must_change_password = TRUE, password_changed_at = NULL WHERE id = $2 AND deleted_at IS NULL', [hash, id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Usuario no encontrado' });
    await query('INSERT INTO PasswordHistory(user_id, password_hash) VALUES ($1,$2)', [id, hash]);
    await audit(req.user && req.user.email, 'USER_RESET_PASSWORD', 'user', id, null);
    return res.json({ reset: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo resetear la contraseña' });
  }
}

async function revokeSessions(req, res) {
  const id = Number(req.params.id);
  const all = !!(req.body && req.body.all);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await query('SELECT email FROM Users WHERE id = $1 AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Usuario no encontrado' });
    const email = rows[0].email;
    const r = await query('UPDATE RefreshTokens SET revoked_at = CURRENT_TIMESTAMP WHERE email = $1 AND revoked_at IS NULL', [email]);
    await audit(req.user && req.user.email, 'USER_REVOKE_SESSIONS', 'user', id, { count: r.rowCount });
    return res.json({ revoked: r.rowCount, scope: all ? 'all' : 'all' });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudieron revocar sesiones' });
  }
}

async function getAudit(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await query('SELECT id, actor, action, entity_type, entity_id, meta, created_at FROM AuditLog WHERE entity_type = $1 AND entity_id = $2 ORDER BY id DESC LIMIT 500', ['user', id]);
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo obtener el historial' });
  }
}

async function assignProfile(req, res) {
  const id = Number(req.params.id);
  const { profileId, primary, expiresAt } = req.body || {};
  const pid = Number(profileId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: 'Parámetros inválidos' });
  try {
    await withTransaction(async (client) => {
      if (primary === true) {
        await client.query('DELETE FROM UserProfiles WHERE user_id = $1 AND is_primary = TRUE', [id]);
      }
      await client.query(
        `INSERT INTO UserProfiles(user_id, profile_id, is_primary, expires_at)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (user_id, profile_id) DO UPDATE SET is_primary = EXCLUDED.is_primary, expires_at = EXCLUDED.expires_at`,
        [id, pid, primary === true, expiresAt ? new Date(expiresAt) : null]
      );
    });
    await audit(req.user && req.user.email, 'USER_ASSIGN_PROFILE', 'user', id, { profileId: pid, primary: !!primary });
    return res.json({ assigned: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo asignar el perfil' });
  }
}

async function assignRole(req, res) {
  const id = Number(req.params.id);
  const { roleId } = req.body || {};
  const rid = Number(roleId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(rid) || rid <= 0) return res.status(400).json({ error: 'Parámetros inválidos' });
  try {
    await query('INSERT INTO UserRoles(user_id, role_id, is_primary) VALUES ($1,$2,FALSE) ON CONFLICT DO NOTHING', [id, rid]);
    await audit(req.user && req.user.email, 'USER_ASSIGN_ROLE', 'user', id, { roleId: rid });
    return res.json({ assigned: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo asignar el rol' });
  }
}

async function assignPrimaryRole(req, res) {
  const id = Number(req.params.id);
  const { roleId } = req.body || {};
  const rid = Number(roleId);
  if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(rid) || rid <= 0) return res.status(400).json({ error: 'Parámetros inválidos' });
  try {
    await withTransaction(async (client) => {
      await client.query('UPDATE UserRoles SET is_primary = FALSE WHERE user_id = $1 AND is_primary = TRUE', [id]);
      await client.query(
        `INSERT INTO UserRoles(user_id, role_id, is_primary)
         VALUES ($1,$2,TRUE)
         ON CONFLICT (user_id, role_id) DO UPDATE SET is_primary = TRUE`,
        [id, rid]
      );
    });
    await audit(req.user && req.user.email, 'USER_ASSIGN_PRIMARY_ROLE', 'user', id, { roleId: rid });
    return res.json({ assigned: true, primary: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo asignar el rol principal' });
  }
}

async function bulkAssignProfiles(req, res) {
  const { userIds, profileId, expiresAt } = req.body || {};
  const pid = Number(profileId);
  if (!Array.isArray(userIds) || !Number.isInteger(pid) || pid <= 0) return res.status(400).json({ error: 'Parámetros inválidos' });
  try {
    let count = 0;
    await withTransaction(async (client) => {
      for (const uid of userIds) {
        const id = Number(uid);
        if (!Number.isInteger(id) || id <= 0) continue;
        await client.query(
          `INSERT INTO UserProfiles(user_id, profile_id, is_primary, expires_at)
           VALUES ($1,$2,FALSE,$3)
           ON CONFLICT (user_id, profile_id) DO UPDATE SET expires_at = EXCLUDED.expires_at`,
          [id, pid, expiresAt ? new Date(expiresAt) : null]
        );
        count++;
      }
    });
    await audit(req.user && req.user.email, 'USER_BULK_ASSIGN_PROFILE', 'profile', pid, { count });
    return res.json({ assigned: count });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo asignar en masa' });
  }
}

module.exports = { createUser, listUsers, getUser, updateUser, updateStatus, resetPassword, revokeSessions, getAudit, assignProfile, assignRole, bulkAssignProfiles, assignPrimaryRole };
