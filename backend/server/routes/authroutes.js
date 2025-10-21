// authroutes.js
const express = require('express');
const router = express.Router();
const authcontroller = require('../controllers/authcontroller');
const authMiddleware = require('../middlewares/authmiddleware');
const { apiLimiter } = require('../middlewares/security'); // Importar apiLimiter

// Aplicar apiLimiter solo a la ruta de login
router.post('/login', apiLimiter, authcontroller.login);
router.post('/login-step1', apiLimiter, authcontroller.loginStep1);
router.post('/login-step2', apiLimiter, authcontroller.loginStep2);
router.post('/refresh-token', authcontroller.refreshToken);
router.post('/logout', authMiddleware, authcontroller.logout);

module.exports = router;
