const { query } = require('../db/pg');
const { resolveEffectivePermissions, matchPermission } = require('../middlewares/permission');

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

module.exports = { listSellersPublic };
