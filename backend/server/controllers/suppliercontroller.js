const { query } = require('../db/pg');
const { audit } = require('../utils/audit');
const { normalizeSupplierInput, normStr } = require('../utils/suppliers');

function parsePositiveInt(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

async function listSuppliers(req, res) {
  const q = normStr(req.query.q);
  const qDigits = q ? String(q).replace(/\D+/g, '') : '';
  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const size = Math.min(200, Math.max(1, parseInt(req.query.size || '50', 10)));
  const offset = (page - 1) * size;

  const where = ['deleted_at IS NULL'];
  const args = [];
  if (q) {
    args.push(`%${q.toLowerCase()}%`);
    const textIdx = args.length;
    let cuitIdx = textIdx;
    if (qDigits) {
      args.push(`%${qDigits}%`);
      cuitIdx = args.length;
    }
    where.push(
      `(LOWER(name) LIKE $${textIdx} OR COALESCE(cuit, '') LIKE $${cuitIdx} OR LOWER(COALESCE(contact_name, '')) LIKE $${textIdx} OR LOWER(COALESCE(contact_email, '')) LIKE $${textIdx})`
    );
  }

  args.push(size);
  args.push(offset);

  try {
    const { rows } = await query(
      `SELECT id, name, cuit, contact_name, contact_phone, contact_email, created_at, updated_at
         FROM Suppliers
        WHERE ${where.join(' AND ')}
        ORDER BY name ASC, id ASC
        LIMIT $${args.length - 1}
        OFFSET $${args.length}`,
      args
    );
    return res.json(rows);
  } catch (err) {
    console.error('[suppliers] list error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener los proveedores' });
  }
}

async function getSupplier(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const { rows } = await query(
      `SELECT id, name, cuit, contact_name, contact_phone, contact_email, created_at, updated_at
         FROM Suppliers
        WHERE id = $1
          AND deleted_at IS NULL
        LIMIT 1`,
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Proveedor no encontrado' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('[suppliers] get error:', err.message);
    return res.status(500).json({ error: 'No se pudo obtener el proveedor' });
  }
}

async function createSupplier(req, res) {
  const supplier = normalizeSupplierInput(req.body || {});
  if (!supplier.name) {
    return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });
  }

  try {
    if (supplier.cuit) {
      const { rows: byCuit } = await query(
        'SELECT id FROM Suppliers WHERE cuit = $1 AND deleted_at IS NULL LIMIT 1',
        [supplier.cuit]
      );
      if (byCuit.length) {
        return res.status(409).json({ error: 'Ya existe un proveedor con ese CUIT' });
      }
    }

    const { rows: byName } = await query(
      'SELECT id FROM Suppliers WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL LIMIT 1',
      [supplier.name]
    );
    if (byName.length) {
      return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre' });
    }

    const { rows } = await query(
      `INSERT INTO Suppliers(name, cuit, contact_name, contact_phone, contact_email)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, name, cuit, contact_name, contact_phone, contact_email, created_at, updated_at`,
      [
        supplier.name,
        supplier.cuit,
        supplier.contact_name,
        supplier.contact_phone,
        supplier.contact_email,
      ]
    );
    const created = rows[0];
    await audit(req.user && req.user.email, 'SUPPLIER_CREATE', 'supplier', created.id, {
      name: created.name,
      cuit: created.cuit,
    });
    return res.status(201).json(created);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un proveedor con ese CUIT' });
    }
    console.error('[suppliers] create error:', err.message);
    return res.status(500).json({ error: 'No se pudo crear el proveedor' });
  }
}

async function updateSupplier(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  const supplier = normalizeSupplierInput(req.body || {});
  if (!supplier.name) {
    return res.status(400).json({ error: 'El nombre del proveedor es obligatorio' });
  }

  try {
    const { rows: currentRows } = await query(
      'SELECT id, name, cuit FROM Suppliers WHERE id = $1 AND deleted_at IS NULL LIMIT 1',
      [id]
    );
    if (!currentRows.length) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }

    if (supplier.cuit) {
      const { rows: byCuit } = await query(
        'SELECT id FROM Suppliers WHERE cuit = $1 AND deleted_at IS NULL AND id <> $2 LIMIT 1',
        [supplier.cuit, id]
      );
      if (byCuit.length) {
        return res.status(409).json({ error: 'Ya existe un proveedor con ese CUIT' });
      }
    }

    const { rows: byName } = await query(
      'SELECT id FROM Suppliers WHERE LOWER(name) = LOWER($1) AND deleted_at IS NULL AND id <> $2 LIMIT 1',
      [supplier.name, id]
    );
    if (byName.length) {
      return res.status(409).json({ error: 'Ya existe un proveedor con ese nombre' });
    }

    const { rows } = await query(
      `UPDATE Suppliers
          SET name = $1,
              cuit = $2,
              contact_name = $3,
              contact_phone = $4,
              contact_email = $5,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $6
          AND deleted_at IS NULL
      RETURNING id, name, cuit, contact_name, contact_phone, contact_email, created_at, updated_at`,
      [
        supplier.name,
        supplier.cuit,
        supplier.contact_name,
        supplier.contact_phone,
        supplier.contact_email,
        id,
      ]
    );
    const updated = rows[0];
    await audit(req.user && req.user.email, 'SUPPLIER_UPDATE', 'supplier', updated.id, {
      name: updated.name,
      cuit: updated.cuit,
    });
    return res.json(updated);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'Ya existe un proveedor con ese CUIT' });
    }
    console.error('[suppliers] update error:', err.message);
    return res.status(500).json({ error: 'No se pudo actualizar el proveedor' });
  }
}

async function deleteSupplier(req, res) {
  const id = parsePositiveInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'ID inválido' });

  try {
    const { rows } = await query(
      `UPDATE Suppliers
          SET deleted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND deleted_at IS NULL
      RETURNING id, name, cuit`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Proveedor no encontrado' });
    }
    await audit(req.user && req.user.email, 'SUPPLIER_DELETE', 'supplier', id, {
      name: rows[0].name,
      cuit: rows[0].cuit,
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('[suppliers] delete error:', err.message);
    return res.status(500).json({ error: 'No se pudo eliminar el proveedor' });
  }
}

module.exports = {
  listSuppliers,
  getSupplier,
  createSupplier,
  updateSupplier,
  deleteSupplier,
};
