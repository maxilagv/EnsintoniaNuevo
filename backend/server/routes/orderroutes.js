const express = require('express');
const router = express.Router();
const order = require('../controllers/ordercontroller_v3');
const authMiddleware = require('../middlewares/authmiddleware');
const { requirePermission } = require('../middlewares/permission');

// Admin endpoints (protected by RBAC)
router.get('/pedidos', authMiddleware, requirePermission('ventas.read'), order.listOrdersV2);
router.get('/pedidos/:id/pdf', authMiddleware, requirePermission('ventas.read'), order.orderPdf);
router.get('/pedidos/:id/remito', authMiddleware, requirePermission('ventas.read'), order.orderRemitoPdf);
router.patch('/pedidos/:id', authMiddleware, requirePermission('ventas.write'), order.updateOrderStatus);
router.delete('/pedidos/:id', authMiddleware, requirePermission('ventas.delete'), order.deleteOrder);

module.exports = router;

