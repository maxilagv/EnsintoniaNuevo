const express = require('express');
const router = express.Router();
const order = require('../controllers/ordercontroller_v3');
const { apiLimiter } = require('../middlewares/security');
const { check, validationResult } = require('express-validator');
const { query } = require('../db/pg');

// Checkout público
router.post('/checkout', apiLimiter, order.validateCheckout, order.createOrderV2);

// Contacto público: guarda mensajes en ContactMessages
router.post(
  '/contact',
  apiLimiter,
  [
    check('name').trim().notEmpty().isLength({ min: 2, max: 200 }),
    check('email').trim().isEmail().isLength({ max: 320 }),
    check('phone').optional().trim().isLength({ max: 50 }),
    check('subject').optional().trim().isLength({ max: 200 }),
    check('message').trim().isLength({ min: 2, max: 5000 })
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    const { name, email, phone, subject, message } = req.body || {};
    try {
      await query(
        `INSERT INTO ContactMessages(name, email, phone, message, created_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)`,
        [String(name), String(email), phone ? String(phone) : null, `${subject ? `[${subject}] ` : ''}${String(message)}`]
      );
      return res.status(201).json({ ok: true });
    } catch (e) {
      console.error('Error guardando mensaje de contacto:', e.message);
      return res.status(500).json({ error: 'No se pudo guardar el mensaje' });
    }
  }
);

module.exports = router;
