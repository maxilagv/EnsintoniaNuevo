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
router.get('/analytics/sales-by-seller', authMiddleware, requirePermission('administracion.read'), admin.salesBySeller);
router.get('/analytics/sales-by-seller/:sellerId/detail', authMiddleware, requirePermission('administracion.read'), admin.salesBySellerDetail);
// Rutas alias para compatibilidad (evita 404 si el frontend usa otra variante)
router.get('/analytics-overview', authMiddleware, requirePermission('administracion.read'), admin.analyticsOverview);
router.get('/admin/analytics/overview', authMiddleware, requirePermission('administracion.read'), admin.analyticsOverview);

// Anal�tica financiera avanzada (ingreso bruto/neto + desglose de gastos)
router.get('/analytics/finance', authMiddleware, requirePermission('administracion.read'), admin.analyticsFinance);

// Gastos extraordinarios (ExtraExpenses)
router.get('/extra-expenses', authMiddleware, requirePermission('administracion.read'), admin.listExtraExpenses);
router.post('/extra-expenses', authMiddleware, requirePermission('administracion.configure'), admin.createExtraExpense);
router.patch('/extra-expenses/:id', authMiddleware, requirePermission('administracion.configure'), admin.updateExtraExpense);
router.delete('/extra-expenses/:id', authMiddleware, requirePermission('administracion.configure'), admin.deleteExtraExpense);

module.exports = router;
