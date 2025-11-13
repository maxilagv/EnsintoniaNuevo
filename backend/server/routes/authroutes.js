// authroutes.js
const express = require('express');
const router = express.Router();
const authcontroller = require('../controllers/authcontroller');
const authcontrollerDb = require('../controllers/authcontroller_db');
const authMiddleware = require('../middlewares/authmiddleware');
const { apiLimiter } = require('../middlewares/security'); // Importar apiLimiter
const mecontroller = require('../controllers/mecontroller');

// Aplicar apiLimiter solo a la ruta de login
router.post('/login', apiLimiter, authcontroller.login);
router.post('/login-db', apiLimiter, authcontrollerDb.loginDb);
router.post('/login-step1', apiLimiter, authcontroller.loginStep1);
router.post('/login-step2', apiLimiter, authcontroller.loginStep2);
router.post('/refresh-token', authcontroller.refreshToken);
router.post('/logout', authMiddleware, authcontroller.logout);
router.get('/me', authMiddleware, mecontroller.me);

module.exports = router;
