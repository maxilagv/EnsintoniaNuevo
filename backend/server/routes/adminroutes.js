const express = require('express');
const router = express.Router();
const authMiddleware = require('../middlewares/authmiddleware');
const admin = require('../controllers/admincontroller');
const { requirePermission } = require('../middlewares/permission');

// Mensajes de contacto (admin)
router.get('/contact-messages', authMiddleware, requirePermission('administracion.read'), admin.listContactMessages);
router.delete('/contact-messages/:id', authMiddleware, requirePermission('administracion.configure'), admin.deleteContactMessage);

// Compras (proveedores y compras)
router.post('/purchases', authMiddleware, requirePermission('compras.write'), admin.createPurchase);
router.get('/purchases', authMiddleware, requirePermission('compras.read'), admin.listPurchases);
router.get('/purchases/:id', authMiddleware, requirePermission('compras.read'), admin.getPurchase);
router.patch('/purchases/:id', authMiddleware, requirePermission('compras.write'), admin.updatePurchaseStatus);
router.delete('/purchases/:id', authMiddleware, requirePermission('compras.delete'), admin.deletePurchase);

// Analítica simple (ventas vs compras)
router.get('/analytics/overview', authMiddleware, requirePermission('administracion.read'), admin.analyticsOverview);
// Rutas alias para compatibilidad (evita 404 si el frontend usa otra variante)
router.get('/analytics-overview', authMiddleware, requirePermission('administracion.read'), admin.analyticsOverview);
router.get('/admin/analytics/overview', authMiddleware, requirePermission('administracion.read'), admin.analyticsOverview);

module.exports = router;
