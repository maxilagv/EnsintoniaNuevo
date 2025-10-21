const rateLimit = require('express-rate-limit');

// Número de teléfono para alertas de seguridad (usar .env)
const USER_PHONE_NUMBER = process.env.ALERT_PHONE; 

const failedLoginAttempts = new Map();
const FAILED_LOGIN_THRESHOLD = 5;

/**
 * Función simulada para enviar notificaciones SMS.
 * En producción, esto se integraría con un servicio de SMS real (ej. Twilio).
 * @param {string} message - El mensaje a enviar en el SMS.
 */
async function sendSMSNotification(message) {
  if (!USER_PHONE_NUMBER) {
    console.warn('[ALERTA SMS] ALERT_PHONE no configurado. Mensaje:', message);
    return;
  }
  console.log(`[ALERTA SMS - SIMULADO] Enviando SMS a ${USER_PHONE_NUMBER}: ${message}`);
  // TODO: Para producción, integra un servicio de SMS real aquí (ej. Twilio, Vonage).
  // Ejemplo conceptual con Twilio (requeriría instalar 'twilio' y configurar credenciales en .env):
  /*
  const twilio = require('twilio');
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER; 

  if (accountSid && authToken && twilioPhoneNumber) {
    const client = twilio(accountSid, authToken);
    try {
      await client.messages.create({
        body: `Alerta de Muebleria Maxi: ${message}`,
        from: twilioPhoneNumber,
        to: USER_PHONE_NUMBER 
      });
      console.log('SMS de alerta enviado realmente.');
    } catch (err) {
      console.error(`Error al enviar SMS real: ${err.message}`);
    }
  } else {
    console.warn('Configuración de servicio de SMS incompleta. No se pudo enviar SMS real.');
  }
  */
}

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Demasiadas peticiones desde esta IP, por favor intenta de nuevo después de 15 minutos.',
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next) => {
    sendSMSNotification(`Alerta: IP ${req.ip} ha excedido el límite de peticiones.`);
    res.status(429).send('Demasiadas peticiones desde esta IP, por favor intenta de nuevo después de 15 minutos.');
  }
});

// Limitador global para /api (más laxo que login)
const apiGlobalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
});

const loggingMiddleware = (req, res, next) => {
  const ua = req.get('User-Agent');
  const authHeader = req.get('Authorization');
  const redactedAuth = authHeader ? `${authHeader.split(' ')[0]} [REDACTED]` : 'none';
  console.log(`${new Date().toISOString()} - IP: ${req.ip} - ${req.method} ${req.originalUrl} - UA: ${ua} - Auth: ${redactedAuth}`);
  next();
};

const pathTraversalProtection = (req, res, next) => {
  if (req.url.includes('..') || req.url.includes('//')) {
    sendSMSNotification(`Alerta de seguridad: Intento de Path Traversal detectado desde IP ${req.ip} en URL: ${req.originalUrl}`);
    return res.status(400).send('Ruta inválida');
  }
  next();
};

module.exports = {
  apiLimiter,
  apiGlobalLimiter,
  loggingMiddleware,
  pathTraversalProtection,
  sendSMSNotification,
  failedLoginAttempts,
  FAILED_LOGIN_THRESHOLD
};
