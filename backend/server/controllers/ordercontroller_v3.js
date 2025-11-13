// Controladores de pedidos (Orders) — versión unificada

const { query, withTransaction } = require('../db/pg');
const PDFDocument = require('pdfkit');
const { body, validationResult } = require('express-validator');

// Validaciones de checkout
const validateCheckout = [
  body('buyer.name').trim().isLength({ min: 2 }).withMessage('Nombre requerido'),
  body('buyer.lastname').trim().isLength({ min: 2 }).withMessage('Apellido requerido'),
  body('buyer.dni').trim().matches(/^\d{7,10}$/).withMessage('DNI inválido'),
  body('buyer.email').optional().isEmail().withMessage('Email inválido'),
  body('buyer.phone').optional().isLength({ min: 6 }).withMessage('Teléfono inválido'),
  body('buyer.code').optional().isLength({ min: 2, max: 64 }),

  body('items').isArray({ min: 1 }).withMessage('Debe enviar items'),
  body('items.*.productId').isInt({ gt: 0 }).withMessage('productId inválido'),
  body('items.*.quantity').isInt({ gt: 0 }).withMessage('quantity inválido'),
];

async function createOrderUnified(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

  const { buyer = {}, items = [] } = req.body || {};
  try {
    const result = await withTransaction(async (client) => {
      // 1) Cargar productos y bloquear filas
      const ids = items.map((i) => i.productId);
      const { rows: products } = await client.query(
        `SELECT id, name, price::float AS price, stock_quantity
           FROM Products
          WHERE id = ANY($1::int[]) FOR UPDATE`,
        [ids]
      );
      const byId = new Map(products.map((p) => [p.id, p]));

      // 2) Validar stock y calcular total
      let total = 0;
      for (const item of items) {
        const p = byId.get(item.productId);
        if (!p) { const e = new Error(`Producto ${item.productId} inexistente`); e.statusCode = 404; throw e; }
        if (p.stock_quantity < item.quantity) { const e = new Error(`Stock insuficiente para producto ${p.name}`); e.statusCode = 409; throw e; }
        total += p.price * item.quantity;
      }

      // 3) Descontar stock
      for (const item of items) {
        await client.query(
          'UPDATE Products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
          [item.quantity, item.productId]
        );
      }

      // 4) Normalizar datos de comprador
      const buyerName = (buyer?.name || 'Cliente Web').trim();
      const buyerLastname = (buyer?.lastname || '').trim();
      const buyerDni = buyer?.dni ? String(buyer.dni).trim() : null;
      const buyerEmail = buyer?.email ? String(buyer.email).trim().toLowerCase() : null;
      const buyerPhone = buyer?.phone ? String(buyer.phone).trim() : null;
      let buyerCode = buyer?.code ? String(buyer.code).trim().toUpperCase() : null;

      // 5) Manejo opcional de buyer_code
      const shouldGenerateCode = (String(req.query?.genCode || '').trim() === '1') || Boolean(buyer?.generateCode);
      if (buyerCode) {
        const { rows: prev } = await client.query('SELECT buyer_email, buyer_phone FROM Orders WHERE buyer_code = $1 ORDER BY id DESC LIMIT 1', [buyerCode]);
        if (prev.length) {
          const prevEmail = (prev[0].buyer_email || '').toLowerCase();
          const prevPhone = prev[0].buyer_phone || '';
          const sameOwner = (buyerEmail && buyerEmail === prevEmail) || (buyerPhone && buyerPhone === prevPhone);
          if (!sameOwner) { const e = new Error('Código ya utilizado por otro cliente'); e.statusCode = 409; throw e; }
        }
      } else if (shouldGenerateCode) {
        async function genCandidate() {
          const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
          const rand = (n) => Array.from({ length: n }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
          return `C-${rand(6)}`;
        }
        let ok = false; let tries = 0;
        while (!ok && tries < 6) {
          const cand = await genCandidate();
          const { rows: exists } = await client.query('SELECT 1 FROM Orders WHERE buyer_code = $1 LIMIT 1', [cand]);
          if (!exists.length) { buyerCode = cand; ok = true; }
          tries++;
        }
        if (!ok) buyerCode = `C-${Date.now().toString(36).toUpperCase()}`;
      }

      // 6) Crear orden con todos los campos
      const insOrder = await client.query(
        `INSERT INTO Orders(user_id, order_date, status, total_amount,
                            buyer_name, buyer_lastname, buyer_dni, buyer_email, buyer_phone)
         VALUES (NULL, CURRENT_TIMESTAMP, $1, $2, $3, $4, $5, $6, $7)
         RETURNING id`,
        ['PAID', total, buyerName, buyerLastname || null, buyerDni || null, buyerEmail || null, buyerPhone || null]
      );
      const orderId = insOrder.rows[0].id;
      if (buyerCode) await client.query('UPDATE Orders SET buyer_code = $1 WHERE id = $2', [buyerCode, orderId]);

      // 7) Insertar items + movimientos
      for (const item of items) {
        const p = byId.get(item.productId);
        await client.query(
          `INSERT INTO OrderItems(order_id, product_id, quantity, unit_price)
           VALUES ($1, $2, $3, $4)`,
          [orderId, item.productId, item.quantity, p.price]
        );
        try {
          await client.query(
            `INSERT INTO movimientos(tipo, producto_id, cantidad, precio_unitario, usuario, nota)
             VALUES ('venta', $1, $2, $3, $4, $5)`,
            [item.productId, item.quantity, p.price, (req.user && req.user.email) || null, `order:${orderId}`]
          );
        } catch (_) {}
      }

      // 8) Asignar número de orden
      const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const orderNumber = `ORD-${ymd}-${orderId}`;
      await client.query('UPDATE Orders SET order_number = $1 WHERE id = $2', [orderNumber, orderId]);

      return { orderId, orderNumber, buyerCode };
    });

    res.status(201).json(result);
  } catch (err) {
    console.error('Checkout unificado error:', err.message);
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    res.status(500).json({ error: 'No se pudo crear la orden' });
  }
}

async function listOrdersV2(req, res) {
  try {
    const { rows: orders } = await query(
      `SELECT id, order_number, buyer_code,
              buyer_name, buyer_lastname, buyer_dni, buyer_email, buyer_phone,
              total_amount::float AS total_amount, status, order_date
         FROM Orders
        WHERE deleted_at IS NULL
        ORDER BY id DESC
        LIMIT 200`
    );
    if (!orders.length) return res.json([]);
    const ids = orders.map(o => o.id);
    const { rows: items } = await query(
      `SELECT oi.order_id, oi.quantity, oi.unit_price::float AS unit_price, p.name
         FROM OrderItems oi
         JOIN Products p ON p.id = oi.product_id
        WHERE oi.order_id = ANY($1::int[])`,
      [ids]
    );
    const grouped = new Map();
    for (const it of items) {
      if (!grouped.has(it.order_id)) grouped.set(it.order_id, []);
      grouped.get(it.order_id).push({ name: it.name, quantity: it.quantity, unit_price: it.unit_price });
    }
    const result = orders.map(o => ({ ...o, items: grouped.get(o.id) || [] }));
    res.json(result);
  } catch (err) {
    console.error('Error al listar pedidos V2:', err.message);
    res.status(500).json({ error: 'No se pudo obtener pedidos' });
  }
}

async function orderPdf(req, res) {
  const { id } = req.params;
  try {
    const { rows: orders } = await query(
      `SELECT id, order_number, buyer_name, buyer_lastname, buyer_dni, buyer_email, buyer_phone,
              total_amount::float AS total_amount, status, order_date
         FROM Orders WHERE id = $1`,
      [id]
    );
    if (!orders.length) return res.status(404).json({ error: 'Orden no encontrada' });
    const order = orders[0];

    const { rows: items } = await query(
      `SELECT oi.quantity, oi.unit_price::float AS unit_price, p.name
         FROM OrderItems oi
         JOIN Products p ON p.id = oi.product_id
        WHERE oi.order_id = $1`,
      [id]
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${order.order_number}.pdf"`);

    const doc = new PDFDocument({ margin: 50 });
    doc.pipe(res);
    doc.fontSize(18).text('Comprobante de Compra', { align: 'center' }).moveDown(1);
    doc.fontSize(12).text(`Nº de Orden: ${order.order_number}`);
    doc.text(`Fecha: ${new Date(order.order_date).toLocaleString()}`);
    doc.text(`Comprador: ${order.buyer_name}${order.buyer_lastname ? ' ' + order.buyer_lastname : ''}`);
    if (order.buyer_dni) doc.text(`DNI: ${order.buyer_dni}`);
    if (order.buyer_email) doc.text(`Email: ${order.buyer_email}`);
    if (order.buyer_phone) doc.text(`Teléfono: ${order.buyer_phone}`);

    doc.moveDown(1).fontSize(14).text('Items:');
    doc.moveDown(0.5).fontSize(12);
    items.forEach((it, idx) => {
      doc.text(`${idx + 1}. ${it.name}  x${it.quantity}  - $${it.unit_price.toFixed(2)}`);
    });
    doc.moveDown(1).fontSize(14).text(`Total: $${order.total_amount.toFixed(2)}`, { align: 'right' });
    doc.end();
  } catch (err) {
    console.error('Error al generar PDF:', err.message);
    res.status(500).json({ error: 'No se pudo generar el PDF' });
  }
}

async function updateOrderStatus(req, res) {
  const id = Number(req.params.id);
  let status = String(req.body?.status || '').toUpperCase();
  if (status === 'CANCELLED') status = 'CANCELED';
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  const allowed = new Set(['PENDING', 'PAID', 'PACKING', 'SHIPPED', 'DELIVERED', 'CANCELED']);
  if (!allowed.has(status)) return res.status(400).json({ error: 'Estado inválido' });
  try {
    const { rows: prev } = await query(`SELECT status FROM Orders WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!prev.length) return res.status(404).json({ error: 'Orden no encontrada' });
    const oldStatus = String(prev[0].status || '').toUpperCase();
    const { rowCount } = await query(`UPDATE Orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL`, [status, id]);
    if (!rowCount) return res.status(404).json({ error: 'Orden no encontrada' });
    try {
      await query(
        `INSERT INTO OrderStatusHistory(order_id, old_status, new_status, changed_by)
         VALUES ($1, $2, $3, $4)`,
        [id, oldStatus || null, status, (req.user && req.user.email) || null]
      );
      await query(
        `INSERT INTO AuditLog(actor, action, entity_type, entity_id, meta)
         VALUES ($1, $2, 'ORDER', $3, $4)`,
        [(req.user && req.user.email) || null, 'ORDER_STATUS_CHANGE', id, JSON.stringify({ oldStatus, newStatus: status })]
      );
    } catch (_) {}
    const payload = { ok: true };
    if (status === 'DELIVERED') {
      payload.remitoUrl = `/api/pedidos/${id}/remito`;
    }
    return res.json(payload);
  } catch (err) {
    console.error('updateOrderStatus error:', err.message);
    return res.status(500).json({ error: 'No se pudo actualizar el estado' });
  }
}

async function deleteOrder(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
  try {
    const { rows } = await query(`SELECT status FROM Orders WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
    const st = String(rows[0].status || '').toUpperCase();
    if (st !== 'DELIVERED') return res.status(400).json({ error: 'Solo se puede eliminar una orden entregada' });
    const { rowCount } = await query(`UPDATE Orders SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Orden no encontrada' });
    try {
      await query(
        `INSERT INTO AuditLog(actor, action, entity_type, entity_id, meta)
         VALUES ($1, $2, 'ORDER', $3, $4)`,
        [(req.user && req.user.email) || null, 'ORDER_SOFT_DELETE', id, JSON.stringify({ status: st })]
      );
    } catch(_) {}
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteOrder error:', err.message);
    return res.status(500).json({ error: 'No se pudo eliminar la orden' });
  }
}

async function orderRemitoPdf(req, res) {
  const { id } = req.params;
  try {
    const { rows: orders } = await query(
      `SELECT id, order_number, buyer_name, buyer_lastname, buyer_dni, buyer_email, buyer_phone,
              total_amount::float AS total_amount, status, order_date
         FROM Orders WHERE id = $1`,
      [id]
    );
    if (!orders.length) return res.status(404).json({ error: 'Orden no encontrada' });
    const order = orders[0];

    const { rows: items } = await query(
      `SELECT oi.quantity, oi.unit_price::float AS unit_price, p.name
         FROM OrderItems oi
         JOIN Products p ON p.id = oi.product_id
        WHERE oi.order_id = $1`,
      [id]
    );

    const filename = `REMITO-${order.order_number || id}.pdf`;
    const forceDownload = String(req.query.download || '').toLowerCase() === '1'
                       || String(req.query.disposition || '').toLowerCase() === 'attachment';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `${forceDownload ? 'attachment' : 'attachment'}; filename="${filename}"`);

    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    doc.info = { Title: `Remito - ${order.order_number || id}`, Author: 'Ensintonia' };
    doc.pipe(res);

    const fmtMoney = (n) => {
      const v = Number(n || 0);
      return `$${v.toFixed(2)}`;
    };

    const PAGE_W = doc.page.width;
    const MARGIN = 40;
    const RIGHT_X = PAGE_W - MARGIN;

    const drawHeader = () => {
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(18).text('Remito de Entrega', MARGIN, MARGIN, { align: 'left' });
      doc.font('Helvetica').fontSize(10).fillColor('#333');
      const num = String(order.order_number || id);
      doc.text(`Fecha: ${new Date().toLocaleDateString()}`, RIGHT_X - 200, MARGIN, { width: 200, align: 'right' });
      doc.text(`N: REM-${num}`, RIGHT_X - 200, MARGIN + 14, { width: 200, align: 'right' });
      doc.moveTo(MARGIN, MARGIN + 36).lineTo(RIGHT_X, MARGIN + 36).lineWidth(1).strokeColor('#cccccc').stroke();
      doc.moveDown(1);
    };

    const drawClientInfo = () => {
      const buyerFull = `${order.buyer_name || ''}${order.buyer_lastname ? ' ' + order.buyer_lastname : ''}`.trim();
      const colW = (PAGE_W - MARGIN * 2) / 2;

      doc.fillColor('#111').font('Helvetica-Bold').fontSize(12).text('Datos del cliente', MARGIN, MARGIN + 48);
      doc.font('Helvetica').fontSize(10).fillColor('#333');
      let y = doc.y + 4;
      doc.text(`Nombre: ${buyerFull || '-'}`, MARGIN, y, { width: colW - 10 }); y = doc.y;
      doc.text(`DNI: ${order.buyer_dni || '-'}`, MARGIN, y);
      doc.text(`Email: ${order.buyer_email || '-'}`, MARGIN, doc.y);
      doc.text(`Telefono: ${order.buyer_phone || '-'}`, MARGIN, doc.y);

      doc.fillColor('#111').font('Helvetica-Bold').fontSize(12).text('Detalle de la orden', MARGIN + colW, MARGIN + 48);
      doc.font('Helvetica').fontSize(10).fillColor('#333');
      let y2 = doc.y + 4;
      doc.text(`Orden: ${order.order_number || id}`, MARGIN + colW, y2, { width: colW - 10 }); y2 = doc.y;
      doc.text(`Fecha de compra: ${new Date(order.order_date).toLocaleDateString()}`, MARGIN + colW, y2);
      doc.moveDown(1);
    };

    const drawTableHeader = (y) => {
      doc.rect(MARGIN, y, PAGE_W - MARGIN * 2, 20).fillAndStroke('#f2f2f2', '#cccccc');
      doc.fillColor('#111').font('Helvetica-Bold').fontSize(10);
      const col = [
        { x: MARGIN + 8, w: (PAGE_W - MARGIN * 2) * 0.58, align: 'left',  label: 'Descripcion' },
        { x: MARGIN + (PAGE_W - MARGIN * 2) * 0.60, w: (PAGE_W - MARGIN * 2) * 0.10, align: 'right', label: 'Cant.' },
        { x: MARGIN + (PAGE_W - MARGIN * 2) * 0.72, w: (PAGE_W - MARGIN * 2) * 0.13, align: 'right', label: 'P. Unit.' },
        { x: MARGIN + (PAGE_W - MARGIN * 2) * 0.86, w: (PAGE_W - MARGIN * 2) * 0.14, align: 'right', label: 'Subtotal' },
      ];
      col.forEach((c) => doc.text(c.label, c.x, y + 5, { width: c.w - 10, align: c.align }));
      doc.fillColor('#333').font('Helvetica').fontSize(10);
      return col;
    };

    const drawItems = (startY) => {
      const bottom = doc.page.height - 140;
      let y = startY;
      const cols = drawTableHeader(y);
      y += 24;

      let totalMonto = 0;
      for (const it of items) {
        const qty = Number(it.quantity || 0);
        const unit = Number(it.unit_price || 0);
        const sub = qty * unit;
        totalMonto += sub;

        const rowH = 18;
        if (y + rowH > bottom) {
          doc.addPage();
          drawHeader();
          drawClientInfo();
          y = doc.y + 10;
          drawTableHeader(y);
          y += 24;
        }

        doc.strokeColor('#eeeeee').lineWidth(0.5).moveTo(MARGIN, y + rowH).lineTo(RIGHT_X, y + rowH).stroke();

        doc.fillColor('#333').font('Helvetica').fontSize(10);
        doc.text(String(it.name || '-'), cols[0].x, y + 4, { width: cols[0].w - 10, align: 'left' });
        doc.text(String(qty),             cols[1].x, y + 4, { width: cols[1].w - 10, align: 'right' });
        doc.text(fmtMoney(unit),          cols[2].x, y + 4, { width: cols[2].w - 10, align: 'right' });
        doc.text(fmtMoney(sub),           cols[3].x, y + 4, { width: cols[3].w - 10, align: 'right' });

        y += rowH;
      }
      return { y, totalMonto };
    };

    const drawTotalsAndSign = (y, totalFinal) => {
      doc.font('Helvetica-Bold').fontSize(12).fillColor('#111').text(`Total entregado: ${fmtMoney(totalFinal)}`, MARGIN, y + 10, { width: RIGHT_X - MARGIN, align: 'right' });

      const baseY = y + 50;
      const lineW = 180;
      doc.strokeColor('#cccccc').lineWidth(1)
        .moveTo(MARGIN, baseY).lineTo(MARGIN + lineW, baseY).stroke()
        .moveTo(MARGIN + 210, baseY).lineTo(MARGIN + 210 + lineW, baseY).stroke()
        .moveTo(RIGHT_X - lineW, baseY).lineTo(RIGHT_X, baseY).stroke();

      doc.font('Helvetica').fontSize(9).fillColor('#555');
      doc.text('Aclaracion', MARGIN, baseY + 4, { width: lineW, align: 'left' });
      doc.text('DNI', MARGIN + 210, baseY + 4, { width: lineW, align: 'left' });
      doc.text('Firma', RIGHT_X - lineW, baseY + 4, { width: lineW, align: 'left' });

      doc.fontSize(8).fillColor('#777').text('Este remito acredita la entrega de mercaderia segun detalle. No es factura.', MARGIN, baseY + 30, { width: RIGHT_X - MARGIN, align: 'left' });
    };

    drawHeader();
    drawClientInfo();
    let yStart = doc.y + 10;
    const { y: afterItemsY, totalMonto } = drawItems(yStart);
    const totalFinal = Number.isFinite(order.total_amount) ? order.total_amount : totalMonto;
    drawTotalsAndSign(afterItemsY, totalFinal);

    doc.end();
  } catch (err) {
    console.error('orderRemitoPdf error:', err.message);
    return res.status(500).json({ error: 'No se pudo generar el remito' });
  }
}

module.exports = {
  // Validación
  validateCheckout,
  // Checkout
  createOrder: createOrderUnified,
  createOrderV2: createOrderUnified,
  // Listado y PDF
  listOrdersV2,
  orderPdf,
  orderRemitoPdf,
  // Admin ops
  updateOrderStatus,
  deleteOrder,
};
