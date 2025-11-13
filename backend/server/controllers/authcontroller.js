const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { check, validationResult } = require('express-validator'); // Importar express-validator

// Rutas corregidas para los middlewares
const { sendSMSNotification, failedLoginAttempts, FAILED_LOGIN_THRESHOLD } = require('../middlewares/security.js');
const { SECRET, REFRESH_SECRET, addTokenToBlacklist } = require('../middlewares/authmiddleware.js');
const { sendVerificationEmail } = require('../utils/mailer');
const { query } = require('../db/pg');

const JWT_ALG = process.env.JWT_ALG || 'HS256';
const JWT_ISSUER = process.env.JWT_ISSUER;
const JWT_AUDIENCE = process.env.JWT_AUDIENCE;


const adminUser = {
  email: process.env.ADMIN_EMAIL,
  passwordHash: process.env.ADMIN_PASSWORD_HASH
};

// 2FA - almacenamiento temporal en memoria
// Map: txId -> { email, code, expiresAt, attempts }
const otpStore = new Map();
const OTP_TTL_MS = 5 * 60 * 1000; // 5 minutos
const OTP_MAX_ATTEMPTS = 5;

function generateOtpCode() {
  // 6 dígitos, con relleno
  const num = crypto.randomInt(0, 1000000);
  return num.toString().padStart(6, '0');
}

// --- Secure variants: rotate/persist refresh + revoke user tokens on logout ---
async function refreshTokenV2(req, res) {
  const { refreshToken } = req.body || {};
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token requerido' });
  if (!REFRESH_SECRET || !SECRET) return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  try {
    const verifyOptions = { algorithms: [JWT_ALG] };
    if (JWT_ISSUER) verifyOptions.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) verifyOptions.audience = JWT_AUDIENCE;
    const payload = jwt.verify(refreshToken, REFRESH_SECRET, verifyOptions);
    const email = String(payload.email || '').toLowerCase();
    const jti = payload.jti || payload.jwtid || null;
    if (!jti) return res.status(403).json({ error: 'Token inválido' });
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const { rows } = await query('SELECT id, revoked_at, expires_at FROM RefreshTokens WHERE email = $1 AND jti = $2 AND token_hash = $3 LIMIT 1', [email, jti, hash]);
    if (!rows.length) return res.status(403).json({ error: 'Token no reconocido' });
    const rec = rows[0];
    if (rec.revoked_at) return res.status(403).json({ error: 'Token revocado' });
    if (new Date(rec.expires_at) < new Date()) return res.status(403).json({ error: 'Token expirado' });
    await query('UPDATE RefreshTokens SET revoked_at = CURRENT_TIMESTAMP, last_used_at = CURRENT_TIMESTAMP WHERE id = $1', [rec.id]);
    const accessSignOpts = { algorithm: JWT_ALG, expiresIn: '15m' };
    if (JWT_ISSUER) accessSignOpts.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) accessSignOpts.audience = JWT_AUDIENCE;
    const accessJti = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    const newAccessToken = jwt.sign({ email }, SECRET, { ...accessSignOpts, jwtid: accessJti });
    const newJti = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    const refreshSignOpts = { algorithm: JWT_ALG, expiresIn: '7d', jwtid: newJti };
    if (JWT_ISSUER) refreshSignOpts.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) refreshSignOpts.audience = JWT_AUDIENCE;
    const newRefreshToken = jwt.sign({ email }, REFRESH_SECRET, refreshSignOpts);
    const newHash = crypto.createHash('sha256').update(newRefreshToken).digest('hex');
    const decoded = jwt.decode(newRefreshToken);
    const exp = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7*24*60*60*1000);
    const ua = req.get('User-Agent') || null;
    const ip = req.ip || null;
    await query('INSERT INTO RefreshTokens(email, jti, token_hash, user_agent, ip_address, expires_at) VALUES ($1, $2, $3, $4, $5, $6)', [email, newJti, newHash, ua, ip, exp]);
    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('Error de verificación de refresh token:', err.message);
    return res.status(403).json({ error: 'Refresh token inválido o expirado' });
  }
}

async function logoutV2(req, res) {
  const accessToken = req.token;
  const email = req.user && req.user.email ? String(req.user.email).toLowerCase() : null;
  try { if (accessToken) addTokenToBlacklist(accessToken); } catch {}
  if (email) {
    try { await query('UPDATE RefreshTokens SET revoked_at = CURRENT_TIMESTAMP WHERE email = $1 AND revoked_at IS NULL', [email]); } catch (e) { console.error('[auth] revoke refresh tokens on logout error:', e.message); }
  }
  return res.status(200).json({ message: 'Sesión cerrada. Tokens invalidados.' });
}

// Login de usuarios desde DB (sin 2FA)
async function loginDb(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }
  const { email, password } = req.body || {};
  const clientIp = req.ip;
  const emailNorm = String(email || '').trim().toLowerCase();

  if (!failedLoginAttempts.has(clientIp)) {
    failedLoginAttempts.set(clientIp, 0);
  }

  if (!SECRET || !REFRESH_SECRET) {
    console.error('Error: Las variables de entorno JWT_SECRET o REFRESH_TOKEN_SECRET no están definidas.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  try {
    const sel = await query(
      `SELECT id, email, password_hash, status, must_change_password, failed_attempts, locked_until
         FROM Users WHERE LOWER(email) = $1 AND deleted_at IS NULL LIMIT 1`,
      [emailNorm]
    );
    if (!sel.rows.length) {
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
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
      failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }

    // Reset fallidos
    try { await query('UPDATE Users SET failed_attempts = 0, locked_until = NULL WHERE id = $1', [u.id]); } catch {}
    failedLoginAttempts.delete(clientIp);

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
        [emailNorm, jti, hash, ua, ip, exp]
      );
    } catch (e) {
      console.error('[auth] persist refresh token error (loginDb):', e.message);
    }

    return res.json({ accessToken, refreshToken, user: { id: u.id, email: u.email, mustChangePassword: !!u.must_change_password } });
  } catch (err) {
    console.error('DB login error:', err.message);
    return res.status(500).json({ error: 'Error del servidor' });
  }
}

function newTransaction(email) {
  const txId = crypto.randomBytes(16).toString('hex');
  const code = generateOtpCode();
  const expiresAt = Date.now() + OTP_TTL_MS;
  otpStore.set(txId, { email, code, expiresAt, attempts: 0 });
  return { txId, code, expiresAt };
}

// (El envío de OTP se maneja a través de utils/mailer.js con sendVerificationEmail)

// Reglas de validación para el login
const validateLogin = [
  check('email')
    .isEmail().withMessage('El email debe ser una dirección de correo válida')
    .normalizeEmail(), // Sanitiza el email
  check('password')
    .isLength({ min: 6 }).withMessage('La contraseña debe tener al menos 6 caracteres')
    .trim() // Elimina espacios en blanco
    .escape() // Escapa caracteres HTML para prevenir XSS
];

async function login(req, res) {
  // Ejecutar validación
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;
  const clientIp = req.ip;

  if (!failedLoginAttempts.has(clientIp)) {
    failedLoginAttempts.set(clientIp, 0);
  }

  if (!adminUser.email || !adminUser.passwordHash) {
    console.error('Error: Las variables de entorno ADMIN_EMAIL o ADMIN_PASSWORD_HASH no están definidas.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  const emailNorm = (email || '').trim().toLowerCase();
  const adminNorm = (adminUser.email || '').trim().toLowerCase();
  if (emailNorm !== adminNorm) {
    failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
    if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) {
      sendSMSNotification(`Alerta de seguridad: Múltiples intentos de login fallidos para IP ${clientIp} con email no autorizado.`);
    }
    return res.status(401).json({ error: 'Usuario no autorizado' });
  }

  const match = await bcrypt.compare(password, adminUser.passwordHash);
  if (!match) {
    failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
    if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) {
      sendSMSNotification(`Alerta de seguridad: Múltiples intentos de login fallidos para IP ${clientIp} con contraseña incorrecta.`);
    }
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  failedLoginAttempts.delete(clientIp);

  if (!SECRET || !REFRESH_SECRET) {
    console.error('Error: Las variables de entorno JWT_SECRET o REFRESH_TOKEN_SECRET no están definidas.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  const commonSignOpts = { algorithm: JWT_ALG, expiresIn: '15m' };
  if (JWT_ISSUER) commonSignOpts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) commonSignOpts.audience = JWT_AUDIENCE;

  const accessJti = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const accessToken = jwt.sign({ email }, SECRET, { ...commonSignOpts, jwtid: accessJti });

  const jti = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const refreshSignOpts = { algorithm: JWT_ALG, expiresIn: '7d', jwtid: jti };
  if (JWT_ISSUER) refreshSignOpts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) refreshSignOpts.audience = JWT_AUDIENCE;

  const refreshToken = jwt.sign({ email }, REFRESH_SECRET, refreshSignOpts);
  try {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const decoded = jwt.decode(refreshToken);
    const exp = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7*24*60*60*1000);
    const ua = req.get('User-Agent') || null;
    const ip = req.ip || null;
    await query(
      `INSERT INTO RefreshTokens(email, jti, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [String(email).toLowerCase(), jti, hash, ua, ip, exp]
    );
  } catch (e) {
    console.error('[auth] persist refresh token error:', e.message);
  }

  res.json({ accessToken, refreshToken }); 
}

// Paso 1: verificar credenciales y enviar OTP al correo
async function loginStep1(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;
  const clientIp = req.ip;

  if (!failedLoginAttempts.has(clientIp)) {
    failedLoginAttempts.set(clientIp, 0);
  }

  if (!adminUser.email || !adminUser.passwordHash) {
    console.error('Error: ADMIN_EMAIL o ADMIN_PASSWORD_HASH faltan.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  const emailNorm = (email || '').trim().toLowerCase();
  const adminNorm = (adminUser.email || '').trim().toLowerCase();
  if (emailNorm !== adminNorm) {
    failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
    if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) {
      sendSMSNotification(`Alerta de seguridad: IP ${clientIp} intentó login con email no autorizado.`);
    }
    return res.status(401).json({ error: 'Usuario no autorizado' });
  }

  const match = await bcrypt.compare(password, adminUser.passwordHash);
  if (!match) {
    failedLoginAttempts.set(clientIp, failedLoginAttempts.get(clientIp) + 1);
    if (failedLoginAttempts.get(clientIp) >= FAILED_LOGIN_THRESHOLD) {
      sendSMSNotification(`Alerta de seguridad: IP ${clientIp} múltiples intentos con contraseña incorrecta.`);
    }
    return res.status(401).json({ error: 'Contraseña incorrecta' });
  }

  failedLoginAttempts.delete(clientIp);

  // Crear transacción y enviar OTP
  const { txId, code } = newTransaction(email);
  try {
    await sendVerificationEmail(email, code);
  } catch (e) {
    console.error('Error enviando OTP por email:', e.message);
    return res.status(500).json({ error: 'No se pudo enviar el código de verificación.' });
  }
  return res.json({ otpSent: true, txId });
}

// Paso 2: verificar OTP y emitir tokens
async function loginStep2(req, res) {
  const { txId, code } = req.body || {};
  if (!txId || !code) return res.status(400).json({ error: 'txId y código requeridos' });

  const rec = otpStore.get(txId);
  if (!rec) return res.status(400).json({ error: 'Transacción no encontrada o expirada' });
  if (Date.now() > rec.expiresAt) {
    otpStore.delete(txId);
    return res.status(400).json({ error: 'Código expirado' });
  }
  if (rec.attempts >= OTP_MAX_ATTEMPTS) {
    otpStore.delete(txId);
    return res.status(429).json({ error: 'Demasiados intentos' });
  }
  rec.attempts += 1;
  if (String(code).trim() !== rec.code) {
    return res.status(401).json({ error: 'Código incorrecto' });
  }

  // OTP correcto: eliminar transacción y emitir tokens
  otpStore.delete(txId);

  if (!SECRET || !REFRESH_SECRET) {
    console.error('Error: JWT_SECRET o REFRESH_TOKEN_SECRET faltan.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  const commonSignOpts = { algorithm: JWT_ALG, expiresIn: '15m' };
  if (JWT_ISSUER) commonSignOpts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) commonSignOpts.audience = JWT_AUDIENCE;
  const accessJti2 = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const accessToken = jwt.sign({ email: rec.email }, SECRET, { ...commonSignOpts, jwtid: accessJti2 });

  const jti = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
  const refreshSignOpts = { algorithm: JWT_ALG, expiresIn: '7d', jwtid: jti };
  if (JWT_ISSUER) refreshSignOpts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) refreshSignOpts.audience = JWT_AUDIENCE;
  const refreshToken = jwt.sign({ email: rec.email }, REFRESH_SECRET, refreshSignOpts);

  try {
    const hash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const decoded = jwt.decode(refreshToken);
    const exp = decoded && decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7*24*60*60*1000);
    const ua = req.get('User-Agent') || null;
    const ip = req.ip || null;
    await query(
      `INSERT INTO RefreshTokens(email, jti, token_hash, user_agent, ip_address, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [String(rec.email).toLowerCase(), jti, hash, ua, ip, exp]
    );
  } catch (e) {
    console.error('[auth] persist refresh token (step2) error:', e.message);
  }

  return res.json({ accessToken, refreshToken });
}

function refreshToken(req, res) {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    return res.status(401).json({ error: 'Refresh token requerido' });
  }

  if (!REFRESH_SECRET || !SECRET) {
    console.error('Error: Las variables de entorno REFRESH_TOKEN_SECRET o JWT_SECRET no están definidas.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  try {
    const verifyOptions = { algorithms: [JWT_ALG] };
    if (JWT_ISSUER) verifyOptions.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) verifyOptions.audience = JWT_AUDIENCE;
    const user = jwt.verify(refreshToken, REFRESH_SECRET, verifyOptions);

    const newAccessSignOpts = { algorithm: JWT_ALG, expiresIn: '15m' };
    if (JWT_ISSUER) newAccessSignOpts.issuer = JWT_ISSUER;
    if (JWT_AUDIENCE) newAccessSignOpts.audience = JWT_AUDIENCE;
    const accessJti3 = (crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex'));
    const newAccessToken = jwt.sign({ email: user.email }, SECRET, { ...newAccessSignOpts, jwtid: accessJti3 });
    res.json({ accessToken: newAccessToken });
  } catch (err) {
    console.error('Error de verificación de refresh token:', err.message);
    return res.status(403).json({ error: 'Refresh token inválido o expirado' });
  }
}

function logout(req, res) {
  const accessToken = req.token; 

  if (accessToken) {
    addTokenToBlacklist(accessToken); 
    return res.status(200).json({ message: 'Sesión cerrada exitosamente. Token invalidado.' });
  } else {
    return res.status(400).json({ error: 'No se encontró un token de acceso para invalidar.' });
  }
}

module.exports = {
  login: [...validateLogin, login], // Exportar con el middleware de validación
  loginStep1: [...validateLogin, loginStep1],
  loginStep2,
  refreshToken: refreshTokenV2,
  logout: logoutV2
};
