const { query } = require('../db/pg');
const { resolveEffectivePermissions } = require('../middlewares/permission');

async function me(req, res) {
  try {
    const email = req.user && req.user.email ? String(req.user.email) : null;
    if (!email) return res.status(401).json({ error: 'No autenticado' });
    const adminEmail = String(process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    if (email.trim().toLowerCase() === adminEmail) {
      return res.json({
        email,
        permissions: ['ventas.*','logistica.*','compras.*','rrhh.*','administracion.*']
      });
    }
    const { rows } = await query('SELECT id FROM Users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1', [email.trim().toLowerCase()]);
    if (!rows.length) return res.json({ email, permissions: [] });
    const userId = rows[0].id;
    const set = await resolveEffectivePermissions(userId);
    return res.json({ email, permissions: Array.from(set) });
  } catch (e) {
    return res.status(500).json({ error: 'Error obteniendo permisos' });
  }
}

module.exports = { me };

