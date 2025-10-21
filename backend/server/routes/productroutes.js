const express = require('express');
const router = express.Router();
const productController = require('../controllers/productcontroller.js');
const authMiddleware = require('../middlewares/authmiddleware.js'); // Importar el middleware de autenticación

// Obtener productos (no requiere autenticación para GET)
router.get('/productos', productController.getProducts);

// Agregar producto (requiere autenticación)
router.post('/productos', authMiddleware, productController.createProduct);

// Editar producto (requiere autenticación)
router.put('/productos/:id', authMiddleware, productController.updateProduct);

// Eliminar producto (requiere autenticación)
router.delete('/productos/:id', authMiddleware, productController.deleteProduct);

module.exports = router;
