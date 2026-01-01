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
    .isEmail().withMessage('email invǭlido'),
  body('phone')
    .trim()
    .notEmpty().withMessage('phone requerido')
    .isLength({ min: 6 }).withMessage('phone invǭlido'),
  body('creditLimit')
    .optional()
    .isFloat({ min: 0 }).withMessage('creditLimit debe ser un nǧmero positivo'),
  body('birthdate')
    .optional()
    .isISO8601().withMessage('birthdate invǭlida'),
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
    .isEmail().withMessage('email invǭlido'),
  body('phone')
    .optional()
    .trim()
    .isLength({ min: 6 }).withMessage('phone invǭlido'),
  body('creditLimit')
    .optional()
    .isFloat({ min: 0 }).withMessage('creditLimit debe ser un nǧmero positivo'),
  body('birthdate')
    .optional()
    .isISO8601().withMessage('birthdate invǭlida'),
  body('status')
    .optional()
    .isIn(['ACTIVE', 'INACTIVE', 'PENDING']).withMessage('status invǭlido'),
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
          'ACTIVE',
        ]
      );
      const newId = ins.rows[0].id;

      try {
        await client.query('UPDATE Clients SET origin = $1 WHERE id = $2', ['WEB', newId]);
        await client.query("UPDATE Clients SET status = 'PENDING' WHERE id = $1", [newId]);
      } catch (err) {
        console.warn('[clients] public origin/status update failed:', err.message);
      }

      return newId;
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
        return res.status(409).json({ error: 'Conflicto con código de cliente, intente de nuevo' });
      }
      return res.status(409).json({ error: 'Registro duplicado' });
    }
    console.error('[clients] create public error:', e);
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
    return res.status(400).json({ error: 'ID invǭlido' });
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

async function toggleClientStatus(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invǭlido' });
  }

  try {
    const { rows } = await query(
      'SELECT id, status, deleted_at FROM Clients WHERE id = $1',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const current = rows[0];
    if (current.deleted_at) {
      return res.status(400).json({ error: 'El cliente está eliminado (soft delete)' });
    }

    const nextStatus = current.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const result = await query(
      `UPDATE Clients
          SET status = $1,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
          AND deleted_at IS NULL`,
      [nextStatus, id]
    );
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Cliente no encontrado o ya eliminado' });
    }

    await audit(req.user && req.user.email, 'CLIENT_STATUS_TOGGLE', 'client', id, {
      from: current.status,
      to: nextStatus,
    });

    return res.json({ id, status: nextStatus });
  } catch (e) {
    console.error('[clients] toggle status error:', e.message);
    return res.status(500).json({ error: 'Error actualizando estado del cliente' });
  }
}

async function getClientOrdersSummary(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invǭlido' });
  }

  try {
    const { rows: clientRows } = await query(
      'SELECT id, code, name, tax_id FROM Clients WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (!clientRows.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const client = clientRows[0];

      const { rows } = await query(
        `SELECT
           o.id,
           o.order_number,
           o.order_date,
           o.status,
           o.total_amount::float AS total_amount,
           o.payment_condition,
           o.due_date,
           o.paid_amount::float AS paid_amount,
           o.balance::float AS balance,
           CASE
             WHEN o.payment_condition = 'CTA_CTE'
              AND o.due_date IS NOT NULL
              AND CURRENT_DATE > o.due_date
             THEN (CURRENT_DATE - o.due_date)
             ELSE 0
           END AS days_overdue,
           COALESCE(o.buyer_name, '') AS buyer_name,
           COALESCE(o.buyer_lastname, '') AS buyer_lastname,
           o.buyer_dni,
           o.buyer_email,
           o.buyer_phone,
           ARRAY_AGG(
             json_build_object(
               'product_id', oi.product_id,
               'product_name', p.name,
               'quantity', oi.quantity,
               'unit_price', oi.unit_price::float
             )
           ) AS items
         FROM Orders o
         JOIN OrderItems oi ON oi.order_id = o.id
         JOIN Products p ON p.id = oi.product_id
         WHERE o.deleted_at IS NULL
           AND (o.buyer_code = $1 OR o.buyer_dni = $2)
         GROUP BY
           o.id, o.order_number, o.order_date, o.status,
           o.total_amount, o.payment_condition, o.due_date,
           o.paid_amount, o.balance,
           o.buyer_name, o.buyer_lastname,
           o.buyer_dni, o.buyer_email, o.buyer_phone
         ORDER BY o.order_date DESC, o.id DESC`,
        [client.code || null, client.tax_id || null]
      );

    return res.json({
      client: {
        id: client.id,
        code: client.code,
        name: client.name,
        tax_id: client.tax_id,
      },
      totalOrders: rows.length,
      orders: rows,
    });
  } catch (e) {
    console.error('[clients] orders summary error:', e.message);
      return res.status(500).json({ error: 'No se pudo obtener el historial de compras' });
    }
  }

async function getClientAccountSummary(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inv€đlido' });
  }

  try {
    const { rows: clientRows } = await query(
      'SELECT id, code, name, tax_id, credit_limit FROM Clients WHERE id = $1 AND deleted_at IS NULL',
      [id]
    );
    if (!clientRows.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const client = clientRows[0];

    const { rows: openOrders } = await query(
      `SELECT
         o.id,
         o.order_number,
         o.order_date,
         o.status,
         o.total_amount::float AS total_amount,
         o.payment_condition,
         o.due_date,
         o.paid_amount::float AS paid_amount,
         o.balance::float AS balance,
         CASE
           WHEN o.payment_condition = 'CTA_CTE'
            AND o.due_date IS NOT NULL
            AND CURRENT_DATE > o.due_date
           THEN (CURRENT_DATE - o.due_date)
           ELSE 0
         END AS days_overdue
       FROM Orders o
       WHERE o.deleted_at IS NULL
         AND o.client_id = $1
         AND o.payment_condition = 'CTA_CTE'
         AND o.balance > 0
       ORDER BY o.due_date NULLS LAST, o.order_date DESC, o.id DESC`,
      [id]
    );

    const { rows: movements } = await query(
      `SELECT
         m.id,
         m.order_id,
         m.movement_date,
         m.movement_type,
         m.amount::float AS amount,
         m.description,
         m.created_by
       FROM ClientAccountMovements m
       WHERE m.deleted_at IS NULL
         AND m.client_id = $1
       ORDER BY m.movement_date DESC, m.id DESC
       LIMIT 200`,
      [id]
    );

    const totalOpen = openOrders.reduce(
      (s, o) => s + (Number.isFinite(Number(o.balance)) ? Number(o.balance) : 0),
      0
    );
    const totalOverdue = openOrders.reduce(
      (s, o) =>
        s +
        (o.days_overdue > 0 && Number.isFinite(Number(o.balance))
          ? Number(o.balance)
          : 0),
      0
    );

    return res.json({
      client: {
        id: client.id,
        code: client.code,
        name: client.name,
        tax_id: client.tax_id,
        creditLimit:
          client.credit_limit != null ? Number(client.credit_limit) : null,
      },
      summary: {
        totalOpen,
        totalOverdue,
        openOrdersCount: openOrders.length,
      },
      openOrders,
      movements,
    });
  } catch (e) {
    console.error('[clients] account summary error:', e.message);
    return res
      .status(500)
      .json({ error: 'No se pudo obtener la cuenta corriente del cliente' });
  }
}

async function registerClientAccountPayment(req, res) {
  const clientId = Number(req.params.id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ error: 'ID inv€đlido' });
  }

  const body = req.body || {};
  const rawAmount = body.amount;
  const amount = Number(rawAmount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'amount inv€đlido' });
  }

  const rawOrderId = body.orderId != null ? body.orderId : body.order_id;
  const orderId = rawOrderId != null ? Number(rawOrderId) : null;
  if (!Number.isInteger(orderId) || orderId <= 0) {
    return res
      .status(400)
      .json({ error: 'orderId es obligatorio y debe ser v€đlido' });
  }

  const description = normStr(body.description) || null;
  const paymentMethodRaw =
    body.paymentMethod || body.payment_method || 'CASH';
  const dateRaw = body.date || body.paymentDate || body.payment_date;

  let paymentDate = new Date();
  if (dateRaw) {
    const d = new Date(dateRaw);
    if (isNaN(d.getTime())) {
      return res.status(400).json({ error: 'fecha de pago inv€đlida' });
    }
    paymentDate = d;
  }

  let paymentMethodDb = 'EFECTIVO';
  try {
    const pm = String(paymentMethodRaw || 'CASH').toUpperCase();
    if (pm === 'TRANSFER' || pm === 'TRANSFERENCIA') {
      paymentMethodDb = 'TRANSFERENCIA';
    } else if (pm === 'FLETERO') {
      paymentMethodDb = 'FLETERO';
    }
  } catch {
    paymentMethodDb = 'EFECTIVO';
  }

  let createdByUserId = null;
  try {
    const email =
      req.user && req.user.email
        ? String(req.user.email).trim().toLowerCase()
        : null;
    if (email) {
      const { rows: urows } = await query(
        'SELECT id FROM Users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1',
        [email]
      );
      if (urows.length) {
        createdByUserId = urows[0].id;
      }
    }
  } catch {
    createdByUserId = null;
  }

  try {
    const result = await withTransaction(async (client) => {
      const { rows: clientRows } = await client.query(
        'SELECT id, code, name, tax_id FROM Clients WHERE id = $1 AND deleted_at IS NULL',
        [clientId]
      );
      if (!clientRows.length) {
        const err = new Error('Cliente no encontrado');
        err.statusCode = 404;
        throw err;
      }

      const { rows: orderRows } = await client.query(
        `SELECT id, client_id, payment_condition,
                total_amount::float AS total_amount,
                paid_amount::float AS paid_amount,
                balance::float AS balance
           FROM Orders
          WHERE id = $1
            AND deleted_at IS NULL`,
        [orderId]
      );
      if (!orderRows.length) {
        const err = new Error('Orden no encontrada');
        err.statusCode = 404;
        throw err;
      }
      const order = orderRows[0];
      if (order.client_id !== clientId) {
        const err = new Error('La orden no pertenece a este cliente');
        err.statusCode = 400;
        throw err;
      }
      if (order.payment_condition !== 'CTA_CTE') {
        const err = new Error(
          'La orden no es de cuenta corriente (CTA_CTE)'
        );
        err.statusCode = 400;
        throw err;
      }

      const currentBalance = Number(order.balance || 0);
      if (!Number.isFinite(currentBalance) || currentBalance <= 0) {
        const err = new Error('La orden no tiene saldo pendiente');
        err.statusCode = 400;
        throw err;
      }
      if (amount > currentBalance + 0.0001) {
        const err = new Error('El monto supera el saldo pendiente de la orden');
        err.statusCode = 400;
        throw err;
      }

      await client.query(
        `INSERT INTO Payments(order_id, payment_date, amount, payment_method, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [orderId, paymentDate.toISOString(), amount, paymentMethodDb, 'CONFIRMED']
      );

      await client.query(
        `INSERT INTO ClientAccountMovements(client_id, order_id, movement_date, movement_type, amount, description, created_by)
         VALUES ($1, $2, $3, 'CREDITO', $4, $5, $6)`,
        [
          clientId,
          orderId,
          paymentDate.toISOString(),
          amount,
          description || `Pago orden ${orderId}`,
          createdByUserId,
        ]
      );

      const { rows: updated } = await client.query(
        `UPDATE Orders
            SET paid_amount = paid_amount + $1,
                balance = GREATEST(balance - $1, 0),
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $2
          RETURNING paid_amount::float AS paid_amount,
                    balance::float AS balance`,
        [amount, orderId]
      );
      const updatedOrder = updated[0];

      return {
        orderId,
        paidAmount: updatedOrder.paid_amount,
        balance: updatedOrder.balance,
      };
    });

    return res.json({
      ok: true,
      payment: {
        orderId: result.orderId,
        amount,
        paidAmount: result.paidAmount,
        balance: result.balance,
      },
    });
  } catch (e) {
    if (e && e.statusCode) {
      return res.status(e.statusCode).json({ error: e.message });
    }
    console.error('[clients] register payment error:', e.message);
    return res
      .status(500)
      .json({ error: 'No se pudo registrar el pago del cliente' });
  }
}

async function updateClientHandler(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID invǭlido' });
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
    return res.status(400).json({ error: 'ID invǭlido' });
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
  toggleClientStatus,
  getClientOrdersSummary,
  getClientAccountSummary,
  registerClientAccountPayment,
  updateClient: [...validateUpdateClient, updateClientHandler],
  deleteClient,
};
