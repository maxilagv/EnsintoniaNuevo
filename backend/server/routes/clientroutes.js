const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authmiddleware');
const { requirePermission } = require('../middlewares/permission');
const clients = require('../controllers/clientcontroller');

// ABM Clientes
router.post('/clients', auth, requirePermission('clientes.write'), clients.createClient);
router.get('/clients', auth, requirePermission('clientes.read'), clients.listClients);
router.get('/clients/:id', auth, requirePermission('clientes.read'), clients.getClient);
router.put('/clients/:id', auth, requirePermission('clientes.write'), clients.updateClient);
router.delete('/clients/:id', auth, requirePermission('clientes.delete'), clients.deleteClient);

module.exports = router;

