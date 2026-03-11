const { query } = require('../db/pg');
const { resolveEffectivePermissions, matchPermission, resolveRequestUser, isEnvAdmin } = require('../middlewares/permission');
const { listAssignableSalesUsers, findAssignableSalesUserById } = require('../utils/sales-users');
const { canAssignSalesToOtherSeller } = require('../utils/sales-access');

async function listSellersPublic(req, res) {
  try {
    // Vendedor = usuario activo con rol VENTAS_ADMIN
    const { rows } = await query(
      `SELECT DISTINCT u.id, u.username, u.name
         FROM Users u
         JOIN UserRoles ur ON ur.user_id = u.id
         JOIN Roles r ON r.id = ur.role_id
        WHERE u.deleted_at IS NULL
          AND u.status = 'ACTIVE'
          AND r.deleted_at IS NULL
          AND r.name = 'VENTAS_ADMIN'
        ORDER BY u.name ASC, u.id ASC`
    );
    if (!rows.length) return res.json([]);

    const result = [];
    for (const u of rows) {
      try {
        // Mantener chequeo de permisos de ventas como capa extra de seguridad,
        // pero la pertenencia a VENTAS_ADMIN es el criterio principal.
        const perms = await resolveEffectivePermissions(u.id);
        if (!perms || !perms.size) continue;
        if (!matchPermission('ventas.read', perms) && !matchPermission('ventas.*', perms)) continue;
        const displayName =
          (u.username && String(u.username).trim()) ||
          (u.name && String(u.name).trim()) ||
          '';
        result.push({
          id: u.id,
          username: u.username || null,
          name: u.name || null,
          displayName: displayName || null,
        });
      } catch (_) {
        // ignorar errores por usuario individual
      }
    }
    return res.json(result);
  } catch (err) {
    console.error('listSellersPublic error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener vendedores' });
  }
}

async function listLogisticsPublic(req, res) {
  try {
    // Fletero/logística: usuarios activos con rol de logística (LOGISTICA_* o DEPOSITO_*)
    const { rows } = await query(
      `SELECT DISTINCT u.id, u.username, u.name
         FROM Users u
         JOIN UserRoles ur ON ur.user_id = u.id
         JOIN Roles r ON r.id = ur.role_id
        WHERE u.deleted_at IS NULL
          AND u.status = 'ACTIVE'
          AND r.deleted_at IS NULL
          AND (r.name LIKE 'LOGISTICA_%' OR r.name LIKE 'DEPOSITO_%')
        ORDER BY u.name ASC, u.id ASC`
    );

    if (!rows.length) return res.json([]);

    const result = [];
    for (const u of rows) {
      try {
        const perms = await resolveEffectivePermissions(u.id);
        if (!perms || !perms.size) continue;
        if (!matchPermission('logistica.read', perms) && !matchPermission('logistica.*', perms)) continue;
        const displayName =
          (u.username && String(u.username).trim()) ||
          (u.name && String(u.name).trim()) ||
          '';
        if (!displayName) continue;
        result.push({
          id: u.id,
          username: u.username || null,
          name: u.name || null,
          displayName,
        });
      } catch (_) {
        // ignorar errores por usuario individual
      }
    }
    return res.json(result);
  } catch (err) {
    console.error('listLogisticsPublic error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener fleteros' });
  }
}

async function listSellersInternal(req, res) {
  try {
    const q = req.query && req.query.q ? String(req.query.q) : '';
    const limit = req.query && req.query.limit ? Number(req.query.limit) : 100;
    const authEmail = req.user && req.user.email ? String(req.user.email) : '';
    if (isEnvAdmin(authEmail)) {
      const rows = await listAssignableSalesUsers({ q, limit });
      return res.json(rows);
    }

    const resolved = await resolveRequestUser(req);
    const currentUserId = resolved && resolved.user ? resolved.user.id : null;
    if (!Number.isInteger(currentUserId) || currentUserId <= 0) {
      return res.status(403).json({ error: 'Usuario no registrado en el sistema' });
    }

    const granted = await resolveEffectivePermissions(currentUserId);
    if (!canAssignSalesToOtherSeller(granted)) {
      const selfSeller = await findAssignableSalesUserById(currentUserId);
      return res.json(selfSeller ? [selfSeller] : []);
    }

    const rows = await listAssignableSalesUsers({ q, limit });
    return res.json(rows);
  } catch (err) {
    if (err && err.code === 'AMBIGUOUS_AUTH_USER') {
      return res.status(err.statusCode || 409).json({ error: err.message });
    }
    console.error('listSellersInternal error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener vendedores' });
  }
}

module.exports = { listSellersPublic, listLogisticsPublic, listSellersInternal };
