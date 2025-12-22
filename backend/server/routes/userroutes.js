const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authmiddleware');
const { requirePermission } = require('../middlewares/permission');
const users = require('../controllers/usercontroller');

// ABM Usuarios
router.post('/users', auth, requirePermission('administracion.users.write'), users.createUser);
router.get('/users', auth, requirePermission('administracion.users.read'), users.listUsers);
router.get('/users/:id', auth, requirePermission('administracion.users.read'), users.getUser);
router.put('/users/:id', auth, requirePermission('administracion.users.write'), users.updateUser);
router.patch('/users/:id/status', auth, requirePermission('administracion.users.delete'), users.updateStatus);
router.delete('/users/:id', auth, requirePermission('administracion.users.delete'), users.deleteUser);
router.post('/users/:id/reset-password', auth, requirePermission('administracion.users.configure'), users.resetPassword);
router.post('/users/:id/sessions/revoke', auth, requirePermission('administracion.users.configure'), users.revokeSessions);
router.get('/users/:id/audit', auth, requirePermission('administracion.users.read'), users.getAudit);
// Assignments
router.post('/users/:id/profiles', auth, requirePermission('administracion.users.write'), users.assignProfile);
router.post('/users/:id/roles', auth, requirePermission('administracion.users.write'), users.assignRole);
router.post('/users/:id/roles/primary', auth, requirePermission('administracion.users.write'), users.assignPrimaryRole);
router.post('/users/bulk-assign', auth, requirePermission('administracion.users.configure'), users.bulkAssignProfiles);
router.patch('/users/:id/commission', auth, requirePermission('administracion.users.configure'), users.updateCommission);
router.post('/users/commission/bulk', auth, requirePermission('administracion.users.configure'), users.bulkUpdateCommission);

module.exports = router;
