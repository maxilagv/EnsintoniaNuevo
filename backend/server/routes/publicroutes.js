const express = require('express');
const router = express.Router();
const order = require('../controllers/ordercontroller');

// Checkout público
router.post('/checkout', order.validateCheckout, order.createOrderV2);

module.exports = router;
