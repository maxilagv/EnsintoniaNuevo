const { body, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db/pg');
const { audit } = require('../utils/audit');

function normStr(v) {
  return v == null ? null : String(v).trim();
}

function normLower(v) {
  return v == null ? null : String(v).trim().toLowerCase();
}

function normDigits(v) {
  if (v == null) return null;
  return String(v).replace(/\D+/g, '');
}

async function generateUniqueClientCode(clientType) {
  const prefix = clientType === 'JURIDICA' ? 'CJ-' : 'CF-';
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rand = (n) =>
    Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');

  for (let i = 0; i < 6; i++) {
    const candidate = prefix + rand(6);
    const { rows } = await query(
      'SELECT 1 FROM Clients WHERE code = $1 AND deleted_at IS NULL LIMIT 1',
      [candidate]
    );
    if (!rows.length) return candidate;
  }
  return prefix + Date.now().toString(36).toUpperCase();
}

const validateCreateClient = [
  body('name')
    .trim()
    .notEmpty().withMessage('name requerido')
    .isLength({ min: 2, max: 255 }).withMessage('name debe tener entre 2 y 255 caracteres'),
  body('clientType')
    .optional()
    .isIn(['FISICA', 'JURIDICA']).withMessage('clientType debe ser FISICA o JURIDICA'),
  body('taxId')
    .trim()
    .notEmpty().withMessage('taxId requerido')
    .isLength({ min: 6, max: 32 }).withMessage('taxId debe tener entre 6 y 32 caracteres'),
  body('ivaCondition')
    .trim()
    .notEmpty().withMessage('ivaCondition requerido'),
  body('email')
    .trim()
    .notEmpty().withMessage('email requerido')
    .isEmail().withMessage('email inválido'),
  body('phone')
    .trim()
    .notEmpty().withMessage('phone requerido')
    .isLength({ min: 6 }).withMessage('phone inválido'),
  body('creditLimit')
    .optional()
    .isFloat({ min: 0 }).withMessage('creditLimit debe ser un número positivo'),
  body('birthdate')
    .optional()
    .isISO8601().withMessage('birthdate inválida'),
];

const validateUpdateClient = [
  body('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 255 }).withMessage('name debe tener entre 2 y 255 caracteres'),
  body('clientType')
    .optional()
    .isIn(['FISICA', 'JURIDICA']).withMessage('clientType debe ser FISICA o JURIDICA'),
  body('ivaCondition')
    .optional()
    .trim()
    .notEmpty().withMessage('ivaCondition no puede ser vacío'),
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('email inválido'),
  body('phone')
    .optional()
    .trim()
    .isLength({ min: 6 }).withMessage('phone inválido'),
  body('creditLimit')
    .optional()
    .isFloat({ min: 0 }).withMessage('creditLimit debe ser un número positivo'),
  body('birthdate')
    .optional()
    .isISO8601().withMessage('birthdate inválida'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE']).withMessage('status inválido'),
];

async function createClientHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const body = req.body || {};
  const name = normStr(body.name);
  const fantasyName = normStr(body.fantasyName);
  const clientType = body.clientType === 'JURIDICA' ? 'JURIDICA' : 'FISICA';
  const rawTaxId = normStr(body.taxId);
  const taxId = normDigits(rawTaxId);
  const taxIdType = normStr(body.taxIdType);
  const ivaCondition = normStr(body.ivaCondition);
  const email = normLower(body.email);
  const phone = normStr(body.phone);
  const address = normStr(body.address);
  const locality = normStr(body.locality);
  const province = normStr(body.province);
  const postalCode = normStr(body.postalCode);
  const contactName = normStr(body.contactName);
  const notes = normStr(body.notes);
  const creditLimit = body.creditLimit != null ? Number(body.creditLimit) : null;
  const birthdate = body.birthdate ? new Date(body.birthdate) : null;

  if (!name || !taxId || !ivaCondition || !email || !phone) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const existsTaxId = await query(
      'SELECT 1 FROM Clients WHERE tax_id = $1 AND deleted_at IS NULL LIMIT 1',
      [taxId]
    );
    if (existsTaxId.rows.length) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
    }

    const code = await generateUniqueClientCode(clientType);

    const result = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO Clients(
           code, name, fantasy_name, client_type,
           tax_id, tax_id_type, iva_condition,
           email, phone, address, locality, province,
           postal_code, contact_name, notes,
           credit_limit, birthdate, status
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
         RETURNING id`,
        [
          code,
          name,
          fantasyName,
          clientType,
          taxId,
          taxIdType,
          ivaCondition,
          email,
          phone,
          address,
          locality,
          province,
          postalCode,
          contactName,
          notes,
          creditLimit != null ? creditLimit : null,
          birthdate,
          'ACTIVE',
        ]
      );
      return ins.rows[0].id;
    });

    await audit(req.user && req.user.email, 'CLIENT_CREATE', 'client', result, {
      code,
      taxId,
      name,
    });

    return res.status(201).json({ id: result, code });
  } catch (e) {
    if (e && e.code === '23505') {
      const detail = String(e.detail || '').toLowerCase();
      if (detail.includes('uq_clients_tax_id')) {
        return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
      }
      if (detail.includes('uq_clients_code')) {
        return res.status(409).json({ error: 'Conflicto con código de cliente, intente de nuevo' });
      }
      return res.status(409).json({ error: 'Registro duplicado' });
    }
    console.error('[clients] create error:', e.message);
    return res.status(500).json({ error: 'Error creando cliente' });
  }
}

async function createClientPublicHandler(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const body = req.body || {};
  const name = normStr(body.name);
  const fantasyName = normStr(body.fantasyName);
  const clientType = body.clientType === 'JURIDICA' ? 'JURIDICA' : 'FISICA';
  const rawTaxId = normStr(body.taxId);
  const taxId = normDigits(rawTaxId);
  const taxIdType = normStr(body.taxIdType);
  const ivaCondition = normStr(body.ivaCondition);
  const email = normLower(body.email);
  const phone = normStr(body.phone);
  const address = normStr(body.address);
  const locality = normStr(body.locality);
  const province = normStr(body.province);
  const postalCode = normStr(body.postalCode);
  const contactName = normStr(body.contactName);
  const notes = normStr(body.notes);
  const creditLimit = body.creditLimit != null ? Number(body.creditLimit) : null;
  const birthdate = body.birthdate ? new Date(body.birthdate) : null;

  if (!name || !taxId || !ivaCondition || !email || !phone) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  try {
    const existsTaxId = await query(
      'SELECT 1 FROM Clients WHERE tax_id = $1 AND deleted_at IS NULL LIMIT 1',
      [taxId]
    );
    if (existsTaxId.rows.length) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
    }

    const code = await generateUniqueClientCode(clientType);

    const result = await withTransaction(async (client) => {
      const ins = await client.query(
        `INSERT INTO Clients(
           code, name, fantasy_name, client_type,
           tax_id, tax_id_type, iva_condition,
           email, phone, address, locality, province,
           postal_code, contact_name, notes,
           credit_limit, birthdate, status, origin
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
         RETURNING id`,
        [
          code,
          name,
          fantasyName,
          clientType,
          taxId,
          taxIdType,
          ivaCondition,
          email,
          phone,
          address,
          locality,
          province,
          postalCode,
          contactName,
          notes,
          creditLimit != null ? creditLimit : null,
          birthdate,
          'PENDING',
          'WEB',
        ]
      );
      return ins.rows[0].id;
    });

    await audit('PUBLIC_WEB', 'CLIENT_CREATE_PUBLIC', 'client', result, {
      code,
      taxId,
      name,
    });

    return res.status(201).json({ id: result, code });
  } catch (e) {
    if (e && e.code === '23505') {
      const detail = String(e.detail || '').toLowerCase();
      if (detail.includes('uq_clients_tax_id')) {
        return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
      }
      if (detail.includes('uq_clients_code')) {
        return res.status(409).json({ error: 'Conflicto con c��digo de cliente, intente de nuevo' });
      }
      return res.status(409).json({ error: 'Registro duplicado' });
    }
    console.error('[clients] create public error:', e.message);
    return res.status(500).json({ error: 'Error creando cliente' });
  }
}

async function listClients(req, res) {
  const q = normLower(req.query.q);
  const taxIdFilter = normDigits(req.query.taxId || req.query.tax_id);
  const status = req.query.status ? String(req.query.status).toUpperCase() : null;
  const clientType = req.query.clientType ? String(req.query.clientType).toUpperCase() : null;
  const locality = normStr(req.query.locality);
  const province = normStr(req.query.province);
  const from = normStr(req.query.from);
  const to = normStr(req.query.to);

  const page = Math.max(1, parseInt(req.query.page || '1', 10));
  const size = Math.min(100, Math.max(1, parseInt(req.query.size || '20', 10)));
  const offset = (page - 1) * size;

  const where = ['deleted_at IS NULL'];
  const args = [];

  if (status) {
    args.push(status);
    where.push(`status = $${args.length}`);
  }
  if (clientType && (clientType === 'FISICA' || clientType === 'JURIDICA')) {
    args.push(clientType);
    where.push(`client_type = $${args.length}`);
  }
  if (taxIdFilter) {
    args.push(taxIdFilter);
    where.push(`tax_id = $${args.length}`);
  }
  if (locality) {
    args.push(locality);
    where.push(`locality = $${args.length}`);
  }
  if (province) {
    args.push(province);
    where.push(`province = $${args.length}`);
  }
  if (from) {
    args.push(from);
    where.push(`created_at >= $${args.length}`);
  }
  if (to) {
    args.push(to);
    where.push(`created_at <= $${args.length}`);
  }
  if (q) {
    args.push(`%${q}%`);
    const idx = args.length;
    where.push(
      `(LOWER(name) LIKE $${idx} OR LOWER(fantasy_name) LIKE $${idx} OR LOWER(email) LIKE $${idx} OR LOWER(code) LIKE $${idx})`
    );
  }

  const whereSql = where.length ? 'WHERE ' + where.join(' AND ') : '';

  try {
    args.push(size);
    args.push(offset);
    const sql = `
      SELECT
        id, code, name, fantasy_name, client_type,
        tax_id, tax_id_type, iva_condition,
        email, phone, address, locality, province,
        postal_code, contact_name, notes,
        credit_limit::float AS credit_limit,
        birthdate,
        status,
        created_at, updated_at
      FROM Clients
      ${whereSql}
      ORDER BY id DESC
      LIMIT $${args.length - 1}
      OFFSET $${args.length}
    `;
    const { rows } = await query(sql, args);
    return res.json(rows);
  } catch (e) {
    console.error('[clients] list error:', e.message);
    return res.status(500).json({ error: 'No se pudieron obtener clientes' });
  }
}

async function getClient(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }
  try {
    const { rows } = await query(
      `SELECT
         id, code, name, fantasy_name, client_type,
         tax_id, tax_id_type, iva_condition,
         email, phone, address, locality, province,
         postal_code, contact_name, notes,
         credit_limit::float AS credit_limit,
         birthdate,
         status,
         created_at, updated_at, deleted_at
       FROM Clients
       WHERE id = $1`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    return res.json(rows[0]);
  } catch (e) {
    console.error('[clients] get error:', e.message);
    return res.status(500).json({ error: 'No se pudo obtener el cliente' });
  }
}

async function updateClientHandler(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const body = req.body || {};

  const name = body.name != null ? normStr(body.name) : undefined;
  const fantasyName = body.fantasyName != null ? normStr(body.fantasyName) : undefined;
  const clientType =
    body.clientType != null
      ? body.clientType === 'JURIDICA'
        ? 'JURIDICA'
        : 'FISICA'
      : undefined;
  const taxIdType = body.taxIdType != null ? normStr(body.taxIdType) : undefined;
  const ivaCondition = body.ivaCondition != null ? normStr(body.ivaCondition) : undefined;
  const email = body.email != null ? normLower(body.email) : undefined;
  const phone = body.phone != null ? normStr(body.phone) : undefined;
  const address = body.address != null ? normStr(body.address) : undefined;
  const locality = body.locality != null ? normStr(body.locality) : undefined;
  const province = body.province != null ? normStr(body.province) : undefined;
  const postalCode = body.postalCode != null ? normStr(body.postalCode) : undefined;
  const contactName = body.contactName != null ? normStr(body.contactName) : undefined;
  const notes = body.notes != null ? normStr(body.notes) : undefined;
  const creditLimit =
    body.creditLimit != null ? Number(body.creditLimit) : undefined;
  const birthdate =
    body.birthdate != null ? new Date(body.birthdate) : undefined;
  const status =
    body.status != null ? String(body.status).toUpperCase() : undefined;

  const fields = [];
  const args = [];

  function addField(column, value) {
    if (value === undefined) return;
    args.push(value);
    fields.push(`${column} = $${args.length}`);
  }

  addField('name', name);
  addField('fantasy_name', fantasyName);
  addField('client_type', clientType);
  addField('tax_id_type', taxIdType);
  addField('iva_condition', ivaCondition);
  addField('email', email);
  addField('phone', phone);
  addField('address', address);
  addField('locality', locality);
  addField('province', province);
  addField('postal_code', postalCode);
  addField('contact_name', contactName);
  addField('notes', notes);
  addField('credit_limit', creditLimit != null ? creditLimit : null);
  addField('birthdate', birthdate);
  addField('status', status);

  if (!fields.length) {
    return res.status(400).json({ error: 'No hay campos para actualizar' });
  }

  args.push(id);
  const sql = `
    UPDATE Clients
       SET ${fields.join(', ')},
           updated_at = CURRENT_TIMESTAMP
     WHERE id = $${args.length}
       AND deleted_at IS NULL
  `;

  try {
    const before = await query(
      'SELECT id, code, name, tax_id FROM Clients WHERE id = $1',
      [id]
    );
    if (!before.rows.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }

    const result = await query(sql, args);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Cliente no encontrado o ya eliminado' });
    }

    await audit(req.user && req.user.email, 'CLIENT_UPDATE', 'client', id, {
      before: before.rows[0],
      updatedFields: Object.keys(body || {}),
    });

    return res.json({ message: 'Cliente actualizado correctamente' });
  } catch (e) {
    console.error('[clients] update error:', e.message);
    return res.status(500).json({ error: 'Error actualizando cliente' });
  }
}

async function deleteClient(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  try {
    const { rows } = await query(
      'SELECT id, code, tax_id, status, deleted_at FROM Clients WHERE id = $1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const clientRow = rows[0];

    const { rows: pending } = await query(
      `SELECT id, status
         FROM Orders
        WHERE deleted_at IS NULL
          AND status NOT IN ('CANCELED','DELIVERED')
          AND (buyer_code = $1 OR buyer_dni = $2)
        LIMIT 1`,
      [clientRow.code || null, clientRow.tax_id || null]
    );
    if (pending.length) {
      return res.status(400).json({
        error: 'No se puede eliminar el cliente: tiene pedidos pendientes o activos',
      });
    }

    const result = await query(
      `UPDATE Clients
          SET status = 'INACTIVE',
              deleted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
          AND deleted_at IS NULL`,
      [id]
    );

    if (!result.rowCount) {
      return res.status(404).json({ error: 'Cliente no encontrado o ya eliminado' });
    }

    await audit(req.user && req.user.email, 'CLIENT_DELETE', 'client', id, {
      code: clientRow.code,
      taxId: clientRow.tax_id,
    });

    return res.json({ message: 'Cliente eliminado correctamente' });
  } catch (e) {
    console.error('[clients] delete error:', e.message);
    return res.status(500).json({ error: 'Error eliminando cliente' });
  }
}

module.exports = {
  createClient: [...validateCreateClient, createClientHandler],
  createClientPublic: [...validateCreateClient, createClientPublicHandler],
  listClients,
  getClient,
  updateClient: [...validateUpdateClient, updateClientHandler],
  deleteClient,
};
