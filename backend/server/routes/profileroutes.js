const express = require('express');
const router = express.Router();
const auth = require('../middlewares/authmiddleware');
const { requirePermission } = require('../middlewares/permission');
const profiles = require('../controllers/profilecontroller');

router.post('/profiles', auth, requirePermission('administracion.configure'), profiles.createProfile);
router.get('/profiles', auth, requirePermission('administracion.read'), profiles.listProfiles);
router.get('/profiles/:id', auth, requirePermission('administracion.read'), profiles.getProfile);
router.put('/profiles/:id', auth, requirePermission('administracion.configure'), profiles.updateProfile);
router.delete('/profiles/:id', auth, requirePermission('administracion.configure'), profiles.deleteProfile);
router.post('/profiles/:id/permissions', auth, requirePermission('administracion.configure'), profiles.setProfilePermissions);

module.exports = router;

