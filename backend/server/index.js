// Cargar variables de entorno desde el archivo .env
require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const crypto = require('crypto');
const cors = require('cors');
const xss = require('xss-clean'); // Importar xss-clean
const compression = require('compression');


const { apiLimiter, apiGlobalLimiter, loggingMiddleware, pathTraversalProtection, sendSMSNotification } = require('./middlewares/security.js');
const authMiddleware = require('./middlewares/authmiddleware.js'); 

// Rutas corregidas a 'routes'
const authRoutes = require('./routes/authroutes.js');
const productRoutes = require('./routes/productroutes.js');
const categoryRoutes = require('./routes/categoryroutes.js');
const publicRoutes = require('./routes/publicroutes.js');
const orderRoutes = require('./routes/orderroutes.js');
const adminRoutes = require('./routes/adminroutes.js');
const userRoutes = require('./routes/userroutes.js');
const profileRoutes = require('./routes/profileroutes.js');
const roleRoutes = require('./routes/roleroutes.js');
const app = express();



// --- FIX para permitir imágenes externas (Cloudinary / Cross-Origin) ---
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
  res.setHeader("Cross-Origin-Embedder-Policy", "require-corp");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

// Confiar en el proxy (cuando se usa detrás de CDN/Reverse Proxy)
if (process.env.TRUST_PROXY === 'true') {
  app.set('trust proxy', 1);
}


// Puerto del servidor, obtenido de las variables de entorno o por defecto 3000
const PORT = process.env.PORT || 3000;

// Deshabilitar el encabezado X-Powered-By para mayor seguridad
app.disable('x-powered-by');

// Usar Helmet para configurar encabezados HTTP y políticas adicionales
// Usar Helmet con ajustes para COEP y recursos externos
app.use(helmet({
  referrerPolicy: { policy: 'no-referrer' },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin" },
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));


// Construir lista de connectSrc para CSP dinámicamente desde entornos permitidos
const cspConnectSrc = (() => {
  const set = new Set([
    "'self'",
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:5500',
    'http://127.0.0.1:5501',
  ]);
  const add = (v) => { if (v && typeof v === 'string') set.add(v.trim()); };
  if (process.env.CORS_ALLOWED_ORIGINS) {
    process.env.CORS_ALLOWED_ORIGINS.split(',').map(s => s.trim()).forEach(origin => {
      try { add(new URL(origin).origin); } catch (_) {}
    });
  }
  if (process.env.PUBLIC_ORIGIN) add(process.env.PUBLIC_ORIGIN);
  return Array.from(set);
})();

const IS_PROD = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

// Per-request CSP nonce and policy without 'unsafe-inline'
app.use((req, res, next) => {
  const nonce = crypto.randomBytes(16).toString('base64');
  res.locals.cspNonce = nonce;
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        `nonce-${nonce}`,
        "https://cdn.tailwindcss.com",
        "https://www.gstatic.com"
      ],
      styleSrc: [
        "'self'",
        `nonce-${nonce}`,
        "https://cdnjs.cloudflare.com"
      ],
      imgSrc: [
        "'self'",
        "data:",
        "https://placehold.co",
        "https://cdn.prod.website-files.com",
        "https://res.cloudinary.com"
      ],
      // Endpoints permitidos para fetch/XHR/WebSocket
      connectSrc: cspConnectSrc,
      fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    },
  })(req, res, next);
});

// Lista de or�genes permitidos para CORS (desde .env o por defecto)
const allowedOrigins = (process.env.CORS_ALLOWED_ORIGINS
  ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(o => o.trim()).filter(Boolean)
  : [
      'http://localhost:8080',
      'http://127.0.0.1:5500',
      'http://127.0.0.1:5501',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ]);
// Soporte de wildcard simple, p.ej.: https://*.vercel.app
function toRegex(pattern) {
  try {
    if (!pattern.includes('*')) return null;
    const escaped = pattern
      .replace(/[.]/g, '\\.')
      .replace(/[\/]/g, '\\/')
      .replace(/\*/g, '.*');
    return new RegExp('^' + escaped + '$', 'i');
  } catch { return null; }
}
const allowedOriginsSet = new Set();
const allowedOriginRegexps = [];
for (const o of allowedOrigins) {
  const rx = toRegex(o);
  if (rx) allowedOriginRegexps.push(rx); else allowedOriginsSet.add(o);
}
// Modo permisivo para demos/despliegues, si se configura
const corsAllowAll = (process.env.CORS_ALLOW_ALL === 'true' || process.env.CORS_ALLOWED_ORIGINS === '*') && !IS_PROD;

// Configuraci�n de CORS
app.use(cors({
  origin: corsAllowAll
    ? true
    : function (origin, callback) {
        if (!origin) return callback(null, true); // requests same-origin o curl sin origin
        if (allowedOriginsSet.has(origin)) {
          return callback(null, true);
        }
        if (allowedOriginRegexps.some(rx => rx.test(origin))) {
          return callback(null, true);
        }
        if (process.env.NODE_ENV !== 'production') {
          console.error(`CORS: Origen no permitido: ${origin}`);
        }
        return callback(new Error('No permitido por CORS'));
      },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: !corsAllowAll,
  optionsSuccessStatus: 204
}));
// ✅ Forzar respuesta automática a todas las preflight OPTIONS
app.options('*', cors({
  origin: corsAllowAll
    ? true
    : function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOriginsSet.has(origin)) return callback(null, true);
        if (allowedOriginRegexps.some(rx => rx.test(origin))) return callback(null, true);
        if (process.env.NODE_ENV !== 'production') {
          console.error(`CORS (preflight): Origen no permitido: ${origin}`);
        }
        return callback(new Error('No permitido por CORS'));
      },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
  credentials: !corsAllowAll,
  optionsSuccessStatus: 204
}));

app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));

// Compresión HTTP para respuestas (gzip/brotli según cliente)
app.use(compression({ threshold: '1kb' }));

// Aplicar protección XSS después del parsing del cuerpo
app.use(xss()); 

// Middleware para asegurar que req.query sea un objeto mutable
app.use((req, res, next) => {
  req.query = { ...req.query }; 
  next();
});

// Protección contra la polución de parámetros HTTP
app.use(require('hpp')());

const path = require('path');
const { constants } = require('buffer');
app.use(express.static(path.join(__dirname, 'public'), {
  etag: true,
  lastModified: true,
  maxAge: process.env.STATIC_MAX_AGE || '7d',
  immutable: true
}));


// Logging controlado por variable de entorno
if (process.env.REQUEST_LOGGING !== 'off') {
  app.use(loggingMiddleware);
}
app.use(pathTraversalProtection);

// Forzar HTTPS si está habilitado (requiere trust proxy en entornos detrás de proxy)
if (process.env.FORCE_HTTPS === 'true') {
  app.use((req, res, next) => {
    if (req.secure || req.headers['x-forwarded-proto'] === 'https') return next();
    return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
  });
}

// Rate limit global barato antes de rutas y auth
app.use('/api', apiGlobalLimiter);
// Rutas públicas (checkout sin auth)
app.use('/api', publicRoutes);

// Rutas de autenticación (login tiene su propio limitador más estricto)
app.use('/api', authRoutes);

// Nota: protegemos rutas sensibles con middleware a nivel de ruta, no global

// Rutas de productos (requieren autenticación JWT)
app.use('/api', productRoutes);
// Rutas de categorías (requieren autenticación JWT para POST/PUT/DELETE)
app.use('/api', categoryRoutes);
// Rutas de pedidos (admin)
app.use('/api', orderRoutes);
// Rutas admin adicionales
app.use('/api', adminRoutes);
// Rutas ABM usuarios y RBAC
app.use('/api', userRoutes);
app.use('/api', profileRoutes);
app.use('/api', roleRoutes);

// Ruta de ejemplo
app.get('/', (req, res) => {
  res.send('Servidor funcionando y mucho más seguro!');
});

// Middleware de manejo de errores centralizado
app.use((err, req, res, next) => {
  console.error(err.stack); // Imprimir el stack trace del error

  // Si el error es por CORS, envía una respuesta JSON con un mensaje específico
  if (err.message === 'No permitido por CORS') {
    return res.status(403).json({ error: 'Acceso denegado: Origen no permitido.' });
  }

  // Enviar notificación SMS para errores graves
  sendSMSNotification(`Alerta de error grave en servidor: ${err.message || 'Error desconocido'}. Ruta: ${req.originalUrl}`);

  // Para cualquier otro error, envía una respuesta JSON genérica de error del servidor
  res.status(500).json({ error: 'Algo salió mal en el servidor. Por favor, inténtalo de nuevo más tarde.' });
});


// Iniciar el servidor
const server = app.listen(PORT, () => {
  console.log(`Servidor escuchando en http://localhost:${PORT}`);
  console.log('¡Servidor iniciado con medidas de seguridad MUY mejoradas!');
});

// Ajustes de keep-alive/headers timeout para mejor rendimiento detrás de proxy/CDN
const keepAliveMs = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 65000);
const headersTimeoutMs = Number(process.env.HEADERS_TIMEOUT_MS || 66000);
server.keepAliveTimeout = keepAliveMs;
server.headersTimeout = headersTimeoutMs;

// Exportar la aplicación para pruebas (si usas supertest)
module.exports = app;
