const { query, withTransaction } = require('../db/pg');
const { audit } = require('../utils/audit');

async function createProfile(req, res) {
  const { name, description, permissionIds } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name requerido' });
  try {
    const result = await withTransaction(async (client) => {
      const ins = await client.query('INSERT INTO Profiles(name, description) VALUES ($1,$2) RETURNING id', [name, description || null]);
      const id = ins.rows[0].id;
      if (Array.isArray(permissionIds)) {
        for (const pid of permissionIds) {
          const p = Number(pid);
          if (Number.isInteger(p) && p > 0) {
            await client.query('INSERT INTO ProfilePermissions(profile_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, p]);
          }
        }
      }
      return id;
    });
    await audit(req.user && req.user.email, 'PROFILE_CREATE', 'profile', result, { name });
    return res.status(201).json({ id: result });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo crear el perfil' });
  }
}

async function listProfiles(req, res) {
  try {
    const { rows } = await query('SELECT id, name, description, created_at, updated_at FROM Profiles WHERE deleted_at IS NULL ORDER BY id DESC', []);
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudieron listar perfiles' });
  }
}

async function getProfile(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await query('SELECT id, name, description, created_at, updated_at FROM Profiles WHERE id=$1 AND deleted_at IS NULL', [id]);
    if (!rows.length) return res.status(404).json({ error: 'Perfil no encontrado' });
    const prof = rows[0];
    const perms = await query('SELECT permission_id FROM ProfilePermissions WHERE profile_id = $1', [id]);
    prof.permissionIds = perms.rows.map(r => r.permission_id);
    return res.json(prof);
  } catch (e) {
    return res.status(500).json({ error: 'Error obteniendo perfil' });
  }
}

async function updateProfile(req, res) {
  const id = Number(req.params.id);
  const { name, description } = req.body || {};
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const r = await query('UPDATE Profiles SET name = COALESCE($1, name), description = COALESCE($2, description) WHERE id = $3 AND deleted_at IS NULL', [name || null, description || null, id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Perfil no encontrado' });
    await audit(req.user && req.user.email, 'PROFILE_UPDATE', 'profile', id, { name, description });
    return res.json({ updated: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo actualizar el perfil' });
  }
}

async function deleteProfile(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const r = await query('DELETE FROM Profiles WHERE id = $1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Perfil no encontrado' });
    await audit(req.user && req.user.email, 'PROFILE_DELETE', 'profile', id, null);
    return res.json({ deleted: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo eliminar el perfil' });
  }
}

async function setProfilePermissions(req, res) {
  const id = Number(req.params.id);
  const { permissionIds } = req.body || {};
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  if (!Array.isArray(permissionIds)) return res.status(400).json({ error: 'permissionIds[] requerido' });
  try {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM ProfilePermissions WHERE profile_id = $1', [id]);
      for (const pid of permissionIds) {
        const p = Number(pid);
        if (Number.isInteger(p) && p > 0) {
          await client.query('INSERT INTO ProfilePermissions(profile_id, permission_id) VALUES ($1,$2)', [id, p]);
        }
      }
    });
    await audit(req.user && req.user.email, 'PROFILE_SET_PERMISSIONS', 'profile', id, { count: permissionIds.length });
    return res.json({ updated: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudieron asignar permisos' });
  }
}

module.exports = { createProfile, listProfiles, getProfile, updateProfile, deleteProfile, setProfilePermissions };

