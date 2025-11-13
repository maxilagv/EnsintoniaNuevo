const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authmiddleware');
const { requirePermission } = require('../middlewares/permission');
const roles = require('../controllers/rolecontroller');

router.post('/roles', auth, requirePermission('administracion.configure'), roles.createRole);
router.get('/roles', auth, requirePermission('administracion.users.read'), roles.listRoles);
router.put('/roles/:id', auth, requirePermission('administracion.configure'), roles.updateRole);
router.delete('/roles/:id', auth, requirePermission('administracion.configure'), roles.deleteRole);
router.post('/roles/:id/permissions', auth, requirePermission('administracion.configure'), roles.setRolePermissions);

module.exports = router;
