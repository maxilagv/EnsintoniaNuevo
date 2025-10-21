const express = require('express');
const router = express.Router();
const order = require('../controllers/ordercontroller');
const authMiddleware = require('../middlewares/authmiddleware');

// Endpoints admin (requieren auth; el middleware se aplica en index.js)
router.get('/pedidos', authMiddleware, order.listOrdersV2);
router.get('/pedidos/:id/pdf', authMiddleware, order.orderPdf);

module.exports = router;
