const jwt = require('jsonwebtoken');

// Claves y parámetros JWT, desde variables de entorno
const SECRET = process.env.JWT_SECRET; 
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const JWT_ALG = process.env.JWT_ALG || 'HS256';

// Lista negra de tokens JWT invalidados (en memoria, para un entorno de producción se usaría una base de datos o Redis)
const tokenBlacklist = new Set();

/**
 * Middleware para verificar el token JWT de acceso.
 * Extrae el token del encabezado 'Authorization', lo verifica y adjunta la información del usuario a la solicitud.
 * También verifica si el token está en la lista negra.
 * @param {object} req - Objeto de solicitud de Express.
 * @param {object} res - Objeto de respuesta de Express.
 * @param {function} next - Función para pasar el control al siguiente middleware.
 */
function authMiddleware(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Extraer el token del encabezado 'Bearer <token>'

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  // Verificar que la clave secreta de JWT esté definida
  if (!SECRET) {
    console.error('Error: La variable de entorno JWT_SECRET no está definida para la verificación del token.');
    return res.status(500).json({ error: 'Configuración del servidor incompleta.' });
  }

  // Verificar si el token está en la lista negra
  if (tokenBlacklist.has(token)) {
    return res.status(401).json({ error: 'Token inválido o revocado' });
  }

  try {
    const verifyOptions = { algorithms: [JWT_ALG] };
    if (process.env.JWT_ISSUER) verifyOptions.issuer = process.env.JWT_ISSUER;
    if (process.env.JWT_AUDIENCE) verifyOptions.audience = process.env.JWT_AUDIENCE;
    const user = jwt.verify(token, SECRET, verifyOptions); // Verificar el token con restricciones
    req.user = user; // Adjuntar la información del usuario a la solicitud
    req.token = token; // Adjuntar el token actual para posible invalidación
    next(); // Continuar con la siguiente función de middleware o ruta
  } catch (err) {
    console.error('Error de verificación de token:', err.message);
    return res.status(403).json({ error: 'Token inválido o expirado' });
  }
}

/**
 * Agrega un token a la lista negra.
 * @param {string} token - El token JWT a invalidar.
 */
function addTokenToBlacklist(token) {
  tokenBlacklist.add(token);
  // En un entorno de producción, aquí se implementaría la persistencia (ej. Redis)
  // y se podría programar la eliminación del token de la lista negra después de su expiración original.
}

module.exports = authMiddleware;
module.exports.addTokenToBlacklist = addTokenToBlacklist;
module.exports.SECRET = SECRET; // Exportar SECRET para que el controlador de auth lo use
module.exports.REFRESH_SECRET = REFRESH_SECRET; // Exportar REFRESH_SECRET
