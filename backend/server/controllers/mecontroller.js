const { resolveEffectivePermissions, isEnvAdmin, resolveRequestUser } = require('../middlewares/permission');

async function me(req, res) {
  try {
    const email = req.user && req.user.email ? String(req.user.email) : null;
    if (!email) return res.status(401).json({ error: 'No autenticado' });
    if (isEnvAdmin(email)) {
      return res.json({
        email,
        permissions: ['ventas.*','logistica.*','compras.*','rrhh.*','administracion.*']
      });
    }
    const resolved = await resolveRequestUser(req);
    if (!resolved || !resolved.user) return res.json({ email, permissions: [] });
    const userId = resolved.user.id;
    const set = await resolveEffectivePermissions(userId);
    return res.json({
      email: resolved.user.email || email,
      userId,
      clientId: resolved.user.client_id || null,
      permissions: Array.from(set),
    });
  } catch (e) {
    if (e && e.code === 'AMBIGUOUS_AUTH_USER') {
      return res.status(e.statusCode || 409).json({ error: e.message });
    }
    return res.status(500).json({ error: 'Error obteniendo permisos' });
  }
}

module.exports = { me };
