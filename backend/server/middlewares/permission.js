const { query } = require('../db/pg');

function isEnvAdmin(email) {
  const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  return adminEmail && String(email || '').trim().toLowerCase() === adminEmail;
}

async function resolveUserIdByEmail(email) {
  const emailNorm = String(email || '').trim().toLowerCase();
  if (!emailNorm) return null;
  try {
    const { rows } = await query('SELECT id FROM Users WHERE LOWER(email) = $1 AND deleted_at IS NULL', [emailNorm]);
    return rows.length ? rows[0].id : null;
  } catch (e) {
    return null;
  }
}

async function resolveEffectivePermissions(userId) {
  if (!userId) return new Set();
  // Role permissions (with simple hierarchy)
  const rolePermSql = `
    WITH RECURSIVE role_tree AS (
      SELECT r.id FROM Roles r
      JOIN UserRoles ur ON ur.role_id = r.id
      WHERE ur.user_id = $1
      UNION ALL
      SELECT r2.id FROM Roles r2
      JOIN role_tree rt ON r2.id = (SELECT parent_role_id FROM Roles WHERE id = rt.id)
    )
    SELECT DISTINCT p.name
    FROM Permissions p
    JOIN RolePermissions rp ON rp.permission_id = p.id
    JOIN role_tree r ON r.id = rp.role_id
    WHERE p.deleted_at IS NULL`;

  const profilePermSql = `
    SELECT DISTINCT p.name
    FROM Permissions p
    JOIN ProfilePermissions pp ON pp.permission_id = p.id
    JOIN UserProfiles up ON up.profile_id = pp.profile_id
    WHERE up.user_id = $1
      AND (up.expires_at IS NULL OR up.expires_at > CURRENT_TIMESTAMP)
      AND p.deleted_at IS NULL`;

  const names = new Set();
  try {
    const r1 = await query(rolePermSql, [userId]);
    r1.rows.forEach(r => names.add(r.name));
  } catch (_) {}
  try {
    const r2 = await query(profilePermSql, [userId]);
    r2.rows.forEach(r => names.add(r.name));
  } catch (_) {}
  return names;
}

function matchPermission(requested, grantedSet) {
  // Exact match or namespace wildcard support (e.g., administracion.*)
  if (grantedSet.has(requested)) return true;
  const parts = requested.split('.');
  for (let i = parts.length; i > 0; i--) {
    const ns = parts.slice(0, i).join('.') + '.*';
    if (grantedSet.has(ns)) return true;
  }
  return false;
}

function requirePermission(perms) {
  const required = Array.isArray(perms) ? perms : [String(perms || '')];
  return async function (req, res, next) {
    try {
      const email = req.user && req.user.email;
      if (!email) return res.status(401).json({ error: 'No autenticado' });
      if (isEnvAdmin(email)) return next();

      const userId = await resolveUserIdByEmail(email);
      if (!userId) return res.status(403).json({ error: 'Usuario no registrado en el sistema' });
      const granted = await resolveEffectivePermissions(userId);
      const ok = required.every(p => matchPermission(p, granted));
      if (!ok) return res.status(403).json({ error: 'Permisos insuficientes' });
      return next();
    } catch (e) {
      return res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
}

function requireAnyPermission(perms) {
  const required = Array.isArray(perms) ? perms : [String(perms || '')];
  return async function (req, res, next) {
    try {
      const email = req.user && req.user.email;
      if (!email) return res.status(401).json({ error: 'No autenticado' });
      if (isEnvAdmin(email)) return next();

      const userId = await resolveUserIdByEmail(email);
      if (!userId) return res.status(403).json({ error: 'Usuario no registrado en el sistema' });
      const granted = await resolveEffectivePermissions(userId);
      const ok = required.some(p => matchPermission(p, granted));
      if (!ok) return res.status(403).json({ error: 'Permisos insuficientes' });
      return next();
    } catch (e) {
      return res.status(500).json({ error: 'Error verificando permisos' });
    }
  };
}

module.exports = { requirePermission, requireAnyPermission, resolveEffectivePermissions, matchPermission, isEnvAdmin };
