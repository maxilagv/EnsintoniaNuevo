const bcrypt = require('bcryptjs');
const { query, withTransaction } = require('../db/pg');
const { audit } = require('../utils/audit');

function normStr(v) {
  return v == null ? null : String(v).trim();
}

function normLower(v) {
  return v == null ? null : String(v).trim().toLowerCase();
}

async function getClientUserSummary(req, res) {
  const clientId = Number(req.params.id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  try {
    const { rows: clientRows } = await query(
      `SELECT id, code, name, email
         FROM Clients
        WHERE id = $1
          AND deleted_at IS NULL`,
      [clientId]
    );
    if (!clientRows.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const client = clientRows[0];

    const { rows: userRows } = await query(
      `SELECT id, email, status, must_change_password
         FROM Users
        WHERE client_id = $1
          AND deleted_at IS NULL
        ORDER BY id ASC
        LIMIT 1`,
      [clientId]
    );

    const user = userRows.length
      ? {
          id: userRows[0].id,
          email: userRows[0].email,
          status: userRows[0].status,
          mustChangePassword: !!userRows[0].must_change_password,
        }
      : null;

    return res.json({
      clientId: client.id,
      clientCode: client.code,
      clientName: client.name,
      clientEmail: client.email,
      user,
    });
  } catch (e) {
    console.error('[client-user] get summary error:', e.message);
    return res.status(500).json({ error: 'No se pudo obtener el usuario del cliente' });
  }
}

async function createClientUser(req, res) {
  const clientId = Number(req.params.id);
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return res.status(400).json({ error: 'ID de cliente inválido' });
  }

  const body = req.body || {};
  const emailRaw = normLower(body.email);
  const passwordPlain = normStr(body.password) || '';
  const nameRaw = normStr(body.name);

  if (!passwordPlain || passwordPlain.length < 8) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  }

  try {
    const { rows: clientRows } = await query(
      `SELECT id, code, name, email
         FROM Clients
        WHERE id = $1
          AND deleted_at IS NULL`,
      [clientId]
    );
    if (!clientRows.length) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    const client = clientRows[0];

    const email = emailRaw || normLower(client.email);
    const name = nameRaw || normStr(client.name) || email;
    if (!email) {
      return res.status(400).json({ error: 'El cliente no tiene email y no se envió uno' });
    }

    const { rows: existingUser } = await query(
      'SELECT id FROM Users WHERE client_id = $1 AND deleted_at IS NULL LIMIT 1',
      [clientId]
    );
    if (existingUser.length) {
      return res.status(409).json({ error: 'El cliente ya tiene un usuario asociado' });
    }

    const { rows: existsEmail } = await query(
      'SELECT id FROM Users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1',
      [email]
    );
    if (existsEmail.length) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
    }

    const rounds = Number(process.env.BCRYPT_ROUNDS || 10);
    const passwordHash = await bcrypt.hash(passwordPlain, rounds);

    const result = await withTransaction(async (clientDb) => {
      const ins = await clientDb.query(
        `INSERT INTO Users(email, username, password_hash, name, status, must_change_password, client_id)
         VALUES ($1, NULL, $2, $3, 'ACTIVE', FALSE, $4)
         RETURNING id`,
        [email, passwordHash, name, clientId]
      );
      const userId = ins.rows[0].id;
      await clientDb.query(
        'INSERT INTO PasswordHistory(user_id, password_hash) VALUES ($1,$2)',
        [userId, passwordHash]
      );
      return userId;
    });

    await audit(
      req.user && req.user.email,
      'CLIENT_LINK_USER',
      'client',
      clientId,
      { userId: result, email }
    );

    return res.status(201).json({ userId: result, email });
  } catch (e) {
    console.error('[client-user] create error:', e.message);
    return res.status(500).json({ error: 'No se pudo crear el usuario para el cliente' });
  }
}

module.exports = {
  getClientUserSummary,
  createClientUser,
};

