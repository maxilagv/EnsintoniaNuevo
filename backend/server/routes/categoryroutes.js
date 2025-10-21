const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categorycontroller');
const authMiddleware = require('../middlewares/authmiddleware'); // Importar el middleware de autenticación

// Obtener categorías (no requiere autenticación para GET)
router.get('/categorias', categoryController.getCategorias);

// Crear categoría (requiere autenticación)
router.post('/categorias', authMiddleware, categoryController.createCategoria);

// Actualizar categoría (requiere autenticación)
router.put('/categorias/:id', authMiddleware, categoryController.updateCategoria);

// Eliminar categoría (requiere autenticación)
router.delete('/categorias/:id', authMiddleware, categoryController.deleteCategoria);

module.exports = router;
