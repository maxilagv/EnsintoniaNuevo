const { query, withTransaction } = require('../db/pg');
const { audit } = require('../utils/audit');

async function createRole(req, res) {
  const { name, description, parentRoleId, permissionIds } = req.body || {};
  if (!name) return res.status(400).json({ error: 'name requerido' });
  try {
    const result = await withTransaction(async (client) => {
      const ins = await client.query('INSERT INTO Roles(name, description, parent_role_id) VALUES ($1,$2,$3) RETURNING id', [name, description || null, parentRoleId || null]);
      const id = ins.rows[0].id;
      if (Array.isArray(permissionIds)) {
        for (const pid of permissionIds) {
          const p = Number(pid);
          if (Number.isInteger(p) && p > 0) {
            await client.query('INSERT INTO RolePermissions(role_id, permission_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, p]);
          }
        }
      }
      return id;
    });
    await audit(req.user && req.user.email, 'ROLE_CREATE', 'role', result, { name });
    return res.status(201).json({ id: result });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo crear el rol' });
  }
}

async function listRoles(req, res) {
  try {
    const { rows } = await query('SELECT id, name, description, parent_role_id, created_at, updated_at FROM Roles WHERE deleted_at IS NULL', []);
    return res.json(rows);
  } catch (e) {
    return res.status(500).json({ error: 'No se pudieron listar roles' });
  }
}

async function updateRole(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  const { name, description, parentRoleId } = req.body || {};
  try {
    const r = await query('UPDATE Roles SET name = COALESCE($1, name), description = COALESCE($2, description), parent_role_id = $3 WHERE id = $4', [name || null, description || null, parentRoleId || null, id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Rol no encontrado' });
    await audit(req.user && req.user.email, 'ROLE_UPDATE', 'role', id, { name, parentRoleId });
    return res.json({ updated: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo actualizar el rol' });
  }
}

async function deleteRole(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const r = await query('DELETE FROM Roles WHERE id = $1', [id]);
    if (!r.rowCount) return res.status(404).json({ error: 'Rol no encontrado' });
    await audit(req.user && req.user.email, 'ROLE_DELETE', 'role', id, null);
    return res.json({ deleted: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudo eliminar el rol' });
  }
}

async function setRolePermissions(req, res) {
  const id = Number(req.params.id);
  const { permissionIds } = req.body || {};
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  if (!Array.isArray(permissionIds)) return res.status(400).json({ error: 'permissionIds[] requerido' });
  try {
    await withTransaction(async (client) => {
      await client.query('DELETE FROM RolePermissions WHERE role_id = $1', [id]);
      for (const pid of permissionIds) {
        const p = Number(pid);
        if (Number.isInteger(p) && p > 0) {
          await client.query('INSERT INTO RolePermissions(role_id, permission_id) VALUES ($1,$2)', [id, p]);
        }
      }
    });
    await audit(req.user && req.user.email, 'ROLE_SET_PERMISSIONS', 'role', id, { count: permissionIds.length });
    return res.json({ updated: true });
  } catch (e) {
    return res.status(500).json({ error: 'No se pudieron asignar permisos' });
  }
}

module.exports = { createRole, listRoles, updateRole, deleteRole, setRolePermissions };
