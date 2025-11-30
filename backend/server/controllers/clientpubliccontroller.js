const { body, validationResult } = require('express-validator');
const bcrypt = require('bcryptjs');
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

const validatePublicRegistration = [
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
    .isEmail().withMessage('email invalido'),
  body('phone')
    .trim()
    .notEmpty().withMessage('phone requerido')
    .isLength({ min: 6 }).withMessage('phone invalido'),
  body('password')
    .isString().withMessage('password requerido')
    .trim()
    .isLength({ min: 8, max: 200 }).withMessage('password debe tener entre 8 y 200 caracteres'),
];

async function createClientPublicWithUserHandler(req, res) {
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
  const passwordPlain = body.password ? String(body.password) : '';

  if (!name || !taxId || !ivaCondition || !email || !phone || !passwordPlain) {
    return res.status(400).json({ error: 'Faltan campos obligatorios' });
  }

  if (passwordPlain.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const existsTaxId = await query(
      'SELECT 1 FROM Clients WHERE tax_id = $1 AND deleted_at IS NULL LIMIT 1',
      [taxId]
    );
    if (existsTaxId.rows.length) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
    }

    const existsEmailClient = await query(
      'SELECT 1 FROM Clients WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1',
      [email]
    );
    if (existsEmailClient.rows.length) {
      return res.status(409).json({ error: 'Ya existe un cliente con ese email' });
    }

    const existsEmailUser = await query(
      'SELECT 1 FROM Users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1',
      [email]
    );
    if (existsEmailUser.rows.length) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }

    const passwordHash = await bcrypt.hash(
      passwordPlain,
      Number(process.env.BCRYPT_ROUNDS || 10)
    );
    const code = await generateUniqueClientCode(clientType);

    const result = await withTransaction(async (client) => {
      const insClient = await client.query(
        `INSERT INTO Clients(
           code, name, fantasy_name, client_type,
           tax_id, tax_id_type, iva_condition,
           email, phone, address, locality, province,
           postal_code, contact_name, notes,
           credit_limit, birthdate, status
         )
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
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
        ]
      );
      const clientId = insClient.rows[0].id;

      try {
        await client.query('UPDATE Clients SET origin = $1 WHERE id = $2', ['WEB', clientId]);
      } catch (err) {
        console.warn('[clients-public] origin update failed:', err.message);
      }

      const insUser = await client.query(
        `INSERT INTO Users(email, password_hash, name, client_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [email, passwordHash, name || email, clientId]
      );
      const userId = insUser.rows[0].id;

      return { clientId, userId };
    });

    await audit('PUBLIC_WEB', 'CLIENT_CREATE_PUBLIC', 'client', result.clientId, {
      code,
      taxId,
      name,
    });

    return res.status(201).json({
      clientId: result.clientId,
      clientCode: code,
      userId: result.userId,
    });
  } catch (e) {
    if (e && e.code === '23505') {
      const detail = String(e.detail || '').toLowerCase();
      if (detail.includes('uq_clients_tax_id')) {
        return res.status(409).json({ error: 'Ya existe un cliente con ese documento' });
      }
      if (detail.includes('uq_clients_email')) {
        return res.status(409).json({ error: 'Ya existe un cliente con ese email' });
      }
      if (detail.includes('uq_clients_code')) {
        return res.status(409).json({ error: 'Conflicto con c�digo de cliente, intente de nuevo' });
      }
      if (detail.includes('users_email_key')) {
        return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
      }
      return res.status(409).json({ error: 'Registro duplicado' });
    }
    console.error('[clients-public] create error:', e);
    return res.status(500).json({ error: 'Error creando cliente' });
  }
}

module.exports = {
  createClientPublicWithUser: [...validatePublicRegistration, createClientPublicWithUserHandler],
};
