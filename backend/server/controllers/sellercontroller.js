const { query } = require('../db/pg');
const { resolveEffectivePermissions, matchPermission } = require('../middlewares/permission');

async function listSellersPublic(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, username, name
         FROM Users
        WHERE deleted_at IS NULL
          AND status = 'ACTIVE'
        ORDER BY name ASC, id ASC`
    );
    if (!rows.length) return res.json([]);

    const result = [];
    for (const u of rows) {
      try {
        const perms = await resolveEffectivePermissions(u.id);
        if (!perms || !perms.size) continue;
        if (!matchPermission('ventas.read', perms) && !matchPermission('ventas.*', perms)) continue;
        const displayName = (u.username && String(u.username).trim()) || (u.name && String(u.name).trim()) || '';
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

