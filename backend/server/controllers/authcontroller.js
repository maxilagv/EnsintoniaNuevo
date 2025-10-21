const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { check, validationResult } = require('express-validator'); // Importar express-validator

// Rutas corregidas para los middlewares
const { sendSMSNotification, failedLoginAttempts, FAILED_LOGIN_THRESHOLD } = require('../middlewares/security.js');
const { SECRET, REFRESH_SECRET, addTokenToBlacklist } = require('../middlewares/authmiddleware.js');
const { sendVerificationEmail } = require('../utils/mailer');

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

function newTransaction(email) {
  const txId = crypto.randomBytes(16).toString('hex');
  const code = generateOtpCode();
  const expiresAt = Date.now() + OTP_TTL_MS;
  otpStore.set(txId, { email, code, expiresAt, attempts: 0 });
  return { txId, code, expiresAt };
}

async function sendOtpEmail(email, code) {
  // Carga perezosa de nodemailer para que no falle si no está instalado
  let nodemailer;
  try {
    nodemailer = require('nodemailer');
  } catch (e) {
    console.warn('[2FA] nodemailer no instalado. Simulando envío de email con OTP:', code);
    return { simulated: true };
  }

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    console.warn('[2FA] SMTP no configurado. Simulando envío de email con OTP:', code);
    return { simulated: true };
  }

  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: SMTP_SECURE === 'true',
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    pool: true,
    maxConnections: 1,
    maxMessages: 5,
    connectionTimeout: 10000,
    greetingTimeout: 7000,
    socketTimeout: 20000
  });

  if (process.env.NODE_ENV !== 'production') {
    console.log(`[2FA][DEV] Enviando OTP ${code} a ${email}`);
  }
  try { await transporter.verify(); } catch (e) { console.warn('[2FA] SMTP verify aviso:', e.message); }
  const info = await transporter.sendMail({
    from: `${process.env.SMTP_FROM_NAME || 'Seguridad Tecnocel'} <${process.env.SMTP_FROM_EMAIL || SMTP_USER}>`,
    to: email,
    subject: 'Código de verificación (2FA) - Panel Admin',
    text: `Tu código de verificación es: ${code}. Vence en 5 minutos.`,
    html: `<p>Tu código de verificación es:</p><p style="font-size:22px;font-weight:700;letter-spacing:2px">${code}</p><p>Vence en 5 minutos.</p>`
  });
  if (process.env.NODE_ENV !== 'production') {
    console.log('[2FA][DEV] nodemailer info:', { messageId: info.messageId, accepted: info.accepted, rejected: info.rejected, response: info.response });
  }
  return { messageId: info.messageId };
}

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

  const accessToken = jwt.sign({ email }, SECRET, commonSignOpts);

  const refreshSignOpts = { algorithm: JWT_ALG, expiresIn: '7d' };
  if (JWT_ISSUER) refreshSignOpts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) refreshSignOpts.audience = JWT_AUDIENCE;

  const refreshToken = jwt.sign({ email }, REFRESH_SECRET, refreshSignOpts);

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
function loginStep2(req, res) {
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
  const accessToken = jwt.sign({ email: rec.email }, SECRET, commonSignOpts);

  const refreshSignOpts = { algorithm: JWT_ALG, expiresIn: '7d' };
  if (JWT_ISSUER) refreshSignOpts.issuer = JWT_ISSUER;
  if (JWT_AUDIENCE) refreshSignOpts.audience = JWT_AUDIENCE;
  const refreshToken = jwt.sign({ email: rec.email }, REFRESH_SECRET, refreshSignOpts);

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
    const newAccessToken = jwt.sign({ email: user.email }, SECRET, newAccessSignOpts);
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
  refreshToken,
  logout
};
