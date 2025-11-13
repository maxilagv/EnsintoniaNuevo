const express = require('express');
const router = express.Router();
const categoryController = require('../controllers/categorycontroller');
const authMiddleware = require('../middlewares/authmiddleware');
const { requirePermission } = require('../middlewares/permission');

// Public GET
router.get('/categorias', categoryController.getCategorias);

// Write operations require logistics permission
router.post('/categorias', authMiddleware, requirePermission('logistica.write'), categoryController.createCategoria);
router.put('/categorias/:id', authMiddleware, requirePermission('logistica.write'), categoryController.updateCategoria);
router.delete('/categorias/:id', authMiddleware, requirePermission('logistica.write'), categoryController.deleteCategoria);

module.exports = router;

