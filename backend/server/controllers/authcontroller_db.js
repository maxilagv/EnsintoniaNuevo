const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { check, validationResult } = require('express-validator');
const { SECRET, REFRESH_SECRET } = require('../middlewares/authmiddleware.js');
const { query } = require('../db/pg');

const JWT_ALG = process.env.JWT_ALG || 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;

// Aceptar identificador que puede ser email o username
const validateLogin = [
  check('email').isString().trim().notEmpty().withMessage('Ingrese email o usuario'),
  check('password').isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres').trim().escape()
];

async function loginDb(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body || {};
  const ident = String(email || '').trim().toLowerCase();

  if (!SECRET || !REFRESH_SECRET) {
    console.error('Error: JWT_SECRET o REFRESH_TOKEN_SECRET no están definidas.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  try {
    const sel = await query(
      `SELECT id, email, username, password_hash, status, must_change_password, failed_attempts, locked_until
         FROM Users WHERE (LOWER(email) = $1 OR LOWER(username) = $1) AND deleted_at IS NULL LIMIT 1`,
      [ident]
    );
    if (!sel.rows.length) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    const u = sel.rows[0];
    if (String(u.status || '').toUpperCase() !== 'ACTIVE') {
      return res.status(403).json({ error: 'Usuario inactivo' });
    }
    if (u.locked_until && new Date(u.locked_until) > new Date()) {
      return res.status(423).json({ error: 'Cuenta bloqueada temporalmente' });
    }
    const ok = await bcrypt.compare(String(password || ''), u.password_hash || '');
    if (!ok) {
      try { await query('UPDATE Users SET failed_attempts = COALESCE(failed_attempts,0) + 1 WHERE id = $1', [u.id]); } catch {}
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    try { await query('UPDATE Users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [u.id]); } catch {}

    const signOpts = { algorithm: JWT_ALG, expiresIn: '15m' };
    if (JWT_ISSUER) signOpts.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) signOpts.audience = JWT_AUDIENCE;
    const accessJti = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    const accessToken = jwt.sign({ email: u.email }, SECRET, { ...signOpts, jwtid: accessJti });

    const jti = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    const refreshSignOpts = { algorithm: JWT_ALG, expiresIn: '7d', jwtid: jti };
    if (JWT_ISSUER) refreshSignOpts.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) refreshSignOpts.audience = JWT_AUDIENCE;
    const refreshToken = jwt.sign({ email: u.email }, REFRESH_SECRET, refreshSignOpts);
    try {
      const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
      const decoded = jwt.decode(refreshToken);
      const exp = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7*24*60*60*1000);
      const ua = req.get('User-Agent') || null;
      const ip = req.ip || null;
      await query(
        `INSERT INTO RefreshTokens(email, jti, token_hash, user_agent, ip_address, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [String(u.email || ident).toLowerCase(), jti, hash, ua, ip, exp]
      );
    } catch (e) {
      console.error('[auth-db] persist refresh token error:', e.message);
    }

    return res.json({ accessToken, refreshToken, user: { id: u.id, email: u.email, mustChangePassword: !!u.must_change_password } });
  } catch (err) {
    console.error('[auth-db] login error:', err.message);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

module.exports = {
  loginDb: [...validateLogin, loginDb]
};
