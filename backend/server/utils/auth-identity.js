const { query } = require('../db/pg');

function normalizeEmail(value) {
  if (value == null) return null;
  const normalized = String(value).trim().toLowerCase();
  return normalized || null;
}

function toPositiveInt(value) {
  const num = Number(value);
  return Number.isInteger(num) && num > 0 ? num : null;
}

async function findActiveUserById(userId) {
  const id = toPositiveInt(userId);
  if (!id) return null;
  const { rows } = await query(
    `SELECT id, email, username, name, client_id, status
       FROM Users
      WHERE id = $1
        AND deleted_at IS NULL
      LIMIT 1`,
    [id]
  );
  return rows[0] || null;
}

async function findActiveUsersByEmail(email, limit = 2) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];
  const safeLimit = Math.max(1, Math.min(Number(limit) || 2, 10));
  const { rows } = await query(
    `SELECT id, email, username, name, client_id, status
       FROM Users
      WHERE LOWER(email) = $1
        AND deleted_at IS NULL
      ORDER BY id ASC
      LIMIT ${safeLimit}`,
    [normalized]
  );
  return rows;
}

async function resolveRequestUser(req) {
  const claims = (req && req.user) || {};
  const tokenUserId = toPositiveInt(claims.userId);
  if (tokenUserId) {
    const userById = await findActiveUserById(tokenUserId);
    if (userById) {
      return { user: userById, source: 'token' };
    }
  }

  const email = normalizeEmail(claims.email);
  if (!email) {
    return { user: null, source: 'none' };
  }

  const users = await findActiveUsersByEmail(email, 2);
  if (users.length > 1) {
    const err = new Error(
      'La sesión no identifica un usuario único. Inicia sesión nuevamente con nombre de usuario.'
    );
    err.code = 'AMBIGUOUS_AUTH_USER';
    err.statusCode = 409;
    throw err;
  }

  return {
    user: users[0] || null,
    source: users.length ? 'email' : 'none',
  };
}

module.exports = {
  normalizeEmail,
  toPositiveInt,
  findActiveUserById,
  findActiveUsersByEmail,
  resolveRequestUser,
};
