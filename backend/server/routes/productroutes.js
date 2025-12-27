const express = require('express');
const router = express.Router();
const productController = require('../controllers/productcontroller.js');
const authMiddleware = require('../middlewares/authmiddleware.js');
const { requirePermission } = require('../middlewares/permission');

// Obtener productos (no requiere autenticación para GET)
router.get('/productos', productController.getProducts);
// Obtener producto por ID (no requiere autenticación para GET)
router.get('/productos/:id', productController.getProductById);

// Agregar producto (requiere autenticación)
router.post('/productos', authMiddleware, requirePermission('logistica.write'), productController.createProduct);

// Editar producto (requiere autenticación)
router.put('/productos/:id', authMiddleware, requirePermission('logistica.write'), productController.updateProduct);
router.patch('/productos/:id/descuento', authMiddleware, requirePermission('logistica.write'), productController.updateProductDiscount);
// Actualizar stock con delta (solo stock)
router.patch('/productos/:id/stock', authMiddleware, requirePermission('logistica.write'), productController.patchStock);

// Eliminar producto (requiere autenticación)
router.delete('/productos/:id', authMiddleware, requirePermission('logistica.write'), productController.deleteProduct);

module.exports = router;
