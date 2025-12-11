// Módulo de controladores para la gestión de pedidos (Orders) en una API de Node.js/Express.

const { query, withTransaction } = require('../db/pg'); // Supone un módulo de base de datos PostgreSQL
const PDFDocument = require('pdfkit');
const { body, validationResult } = require('express-validator');

// --- Validaciones de Request Body ---

/**
 * Middleware de validación para el endpoint de checkout.
 * Asegura que los datos del comprador y los items sean válidos.
 */
const validateCheckout = [
    // Validación de datos del comprador
    body('buyer.name').trim().isLength({ min: 2 }).withMessage('Nombre requerido'),
    body('buyer.email').optional().isEmail().withMessage('Email inválido'),
    body('buyer.phone').optional().isLength({ min: 6 }).withMessage('Teléfono inválido'),

    // Validación de items
    body('items').isArray({ min: 1 }).withMessage('Debe enviar items'),
    body('items.*.productId').isInt({ gt: 0 }).withMessage('productId inválido'),
    body('items.*.quantity').isInt({ gt: 0 }).withMessage('quantity inválido'),
];

// --- V1 Endpoints (Checkout sin buyer_code) ---

/**
 * Crea una nueva orden de compra (checkout).
 * Se ejecuta dentro de una transacción para asegurar atomicidad
 * (validación, bloqueo, descuento de stock, creación de orden/items).
 */
async function createOrder(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    const { buyer, items } = req.body;

    try {
        const result = await withTransaction(async (client) => {
            // 1. Cargar productos involucrados y BLOQUEAR filas para stock
            const ids = items.map((i) => i.productId);
            const { rows: products } = await client.query(
                `SELECT id, name, price::float AS price, stock_quantity
                 FROM Products
                WHERE id = ANY($1::int[]) FOR UPDATE`,
                [ids]
            );

            // Mapear productos por id para fácil acceso
            const byId = new Map(products.map((p) => [p.id, p]));

            // 2. Validar stock y calcular total
            let total = 0;
            for (const item of items) {
                const p = byId.get(item.productId);
                
                // Validación de existencia
                if (!p) { const e = new Error(`Producto ${item.productId} inexistente`); e.statusCode = 404; throw e; }
                
                // Validación de stock
                if (p.stock_quantity < item.quantity) {
                    const e = new Error(`Stock insuficiente para producto ${p.name}`);
                    e.statusCode = 409;
                    throw e;
                }
                total += p.price * item.quantity;
            }

            // 3. Descontar stock (UPDATE)
            for (const item of items) {
                await client.query(
                    'UPDATE Products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
                    [item.quantity, item.productId]
                );
            }

            // 4. Crear orden (INSERT en Orders)
            const insOrder = await client.query(
                `INSERT INTO Orders(user_id, order_date, status, total_amount, buyer_name, buyer_email, buyer_phone)
                 VALUES (NULL, CURRENT_TIMESTAMP, $1, $2, $3, $4, $5) RETURNING id`,
                ['PAID', total, buyer.name, buyer.email || null, buyer.phone || null]
            );
            const orderId = insOrder.rows[0].id;

            // 5. Insertar items (INSERT en OrderItems)
            for (const item of items) {
                const p = byId.get(item.productId);
                await client.query(
                    `INSERT INTO OrderItems(order_id, product_id, quantity, unit_price)
                     VALUES ($1, $2, $3, $4)`,
                    [orderId, item.productId, item.quantity, p.price]
                );
                
                // 6. Registrar movimiento de venta (Opcional, puede fallar sin afectar la orden)
                try {
                    await client.query(
                        `INSERT INTO movimientos(tipo, producto_id, cantidad, precio_unitario, usuario, nota)
                         VALUES ('venta', $1, $2, $3, $4, $5)`,
                        [item.productId, item.quantity, p.price, (req.user && req.user.email) || null, `order:${orderId}`]
                    );
                } catch (_) { 
                    // No hacer nada si el registro de movimiento falla (es secundario a la orden)
                } 
            }

            // 7. Asignar order_number legible
            const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const orderNumber = `ORD-${ymd}-${orderId}`;
            await client.query('UPDATE Orders SET order_number = $1 WHERE id = $2', [orderNumber, orderId]);

            return { orderId, orderNumber };
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('Error en checkout:', err.message);
        // Devolver el error específico (como stock insuficiente) si tiene statusCode
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        res.status(500).json({ error: 'No se pudo crear la orden' });
    }
}

/**
 * Lista las últimas 200 órdenes creadas.
 */
async function listOrders(req, res) {
    try {
        const { rows } = await query(
            `SELECT id, order_number, buyer_name, buyer_email, buyer_phone,
                    total_amount::float AS total_amount, status, order_date
             FROM Orders
            WHERE deleted_at IS NULL
            ORDER BY id DESC
            LIMIT 200`
        );
        res.json(rows);
    } catch (err) {
        console.error('Error al listar pedidos:', err.message);
        res.status(500).json({ error: 'No se pudo obtener pedidos' });
    }
}

/**
 * Genera un PDF de comprobante para una orden específica.
 */
async function orderPdf(req, res) {
    const { id } = req.params;
    try {
        // 1. Obtener datos de la orden
        const { rows: orders } = await query(
            `SELECT id, order_number, buyer_name, buyer_email, buyer_phone, total_amount::float AS total_amount, status, order_date
             FROM Orders WHERE id = $1`,
            [id]
        );
        if (!orders.length) return res.status(404).json({ error: 'Orden no encontrada' });
        const order = orders[0];

        // 2. Obtener items de la orden
        const { rows: items } = await query(
            `SELECT oi.quantity, oi.unit_price::float AS unit_price, p.name
             FROM OrderItems oi
             JOIN Products p ON p.id = oi.product_id
            WHERE oi.order_id = $1`,
            [id]
        );

        // 3. Configurar respuesta para PDF
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `inline; filename="${order.order_number}.pdf"`);

        // 4. Generar PDF
        const doc = new PDFDocument({ margin: 50 });
        doc.pipe(res);

        doc.fontSize(18).text('Comprobante de pre-compra', { align: 'center' }).moveDown(1);

        // Datos del pedido
        doc.fontSize(12).text(`N° de Orden: ${order.order_number}`);
        doc.text(`Fecha: ${new Date(order.order_date).toLocaleString()}`);
        doc.text(`Comprador: ${order.buyer_name}`);
        if (order.buyer_email) doc.text(`Email: ${order.buyer_email}`);
        if (order.buyer_phone) doc.text(`Teléfono: ${order.buyer_phone}`);

        // Items
        doc.moveDown(1).fontSize(14).text('Items:');
        doc.moveDown(0.5).fontSize(12);

        items.forEach((it, idx) => {
            doc.text(`${idx + 1}. ${it.name}  x${it.quantity}  - $${it.unit_price.toFixed(2)}`);
        });

        // Total
        doc.moveDown(1).fontSize(14).text(`Total: $${order.total_amount.toFixed(2)}`, { align: 'right' });

        doc.end();
    } catch (err) {
        console.error('Error al generar PDF:', err.message);
        res.status(500).json({ error: 'No se pudo generar el PDF' });
    }
}

// --- V2 Endpoints con buyer_code reutilizable ---

/**
 * Crea una orden de compra V2, que incluye la generación o validación
 * de un código de cliente (buyer_code) para re-utilización.
 */
async function createOrderV2(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    // Se asume que validateCheckout ha sido ampliado para validar buyer.code si es necesario,
    // o que se confía en la lógica interna para manejarlo.
    const { buyer, items } = req.body;

    try {
        const result = await withTransaction(async (client) => {
            // Lógica de stock y validación (misma que V1)
            const ids = items.map((i) => i.productId);
            const { rows: products } = await client.query(
                `SELECT id, name, price::float AS price, stock_quantity FROM Products WHERE id = ANY($1::int[]) FOR UPDATE`,
                [ids]
            );
            const byId = new Map(products.map((p) => [p.id, p]));
            let total = 0;
            for (const item of items) {
                const p = byId.get(item.productId);
                if (!p) { const e = new Error(`Producto ${item.productId} inexistente`); e.statusCode = 404; throw e; }
                if (p.stock_quantity < item.quantity) { const e = new Error(`Stock insuficiente para producto ${p.name}`); e.statusCode = 409; throw e; }
                total += p.price * item.quantity;
            }
            
            // Descuento de stock (misma que V1)
            for (const item of items) {
                await client.query('UPDATE Products SET stock_quantity = stock_quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2', [item.quantity, item.productId]);
            }

            // Normalización y obtención de buyer_code
            const buyerName = (buyer?.name || 'Cliente Web').trim();
            const buyerEmail = buyer?.email ? String(buyer.email).trim().toLowerCase() : null;
            const buyerPhone = buyer?.phone ? String(buyer.phone).trim() : null;
            let buyerCode = buyer?.code ? String(buyer.code).trim().toUpperCase() : null;

            // Validación o generación del código de comprador
            if (buyerCode) {
                // Si se proporciona un código, validar que pertenezca al mismo cliente (por email/teléfono)
                const { rows: prev } = await client.query('SELECT buyer_email, buyer_phone FROM Orders WHERE buyer_code = $1 ORDER BY id DESC LIMIT 1', [buyerCode]);
                if (prev.length) {
                    const prevEmail = (prev[0].buyer_email || '').toLowerCase();
                    const prevPhone = prev[0].buyer_phone || '';
                    const sameOwner = (buyerEmail && buyerEmail === prevEmail) || (buyerPhone && buyerPhone === prevPhone);
                    if (!sameOwner) { const e = new Error('Código ya utilizado por otro cliente'); e.statusCode = 409; throw e; }
                }
            } else {
                // Si no hay código, generar uno nuevo y asegurar que sea único
                async function genCandidate() {
                    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Evitar I, O, 0, 1
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
                // Fallback de código si las 6 veces falla (muy improbable)
                if (!ok) buyerCode = `C-${Date.now().toString(36).toUpperCase()}`;
            }

            // Crear orden (INSERT en Orders)
            const insOrder = await client.query(
                `INSERT INTO Orders(user_id, order_date, status, total_amount, buyer_name, buyer_email, buyer_phone)
                 VALUES (NULL, CURRENT_TIMESTAMP, $1, $2, $3, $4, $5) RETURNING id`,
                ['PAID', total, buyerName, buyerEmail || null, buyerPhone || null]
            );
            const orderId = insOrder.rows[0].id;
            
            // Asignar el buyer_code a la orden
            await client.query('UPDATE Orders SET buyer_code = $1 WHERE id = $2', [buyerCode || null, orderId]);

            // Insertar items y registrar movimientos (misma que V1)
            for (const item of items) {
                const p = byId.get(item.productId);
                await client.query(`INSERT INTO OrderItems(order_id, product_id, quantity, unit_price) VALUES ($1, $2, $3, $4)`, [orderId, item.productId, item.quantity, p.price]);
                try {
                    await client.query(
                        `INSERT INTO movimientos(tipo, producto_id, cantidad, precio_unitario, usuario, nota)
                         VALUES ('venta', $1, $2, $3, $4, $5)`,
                        [item.productId, item.quantity, p.price, (req.user && req.user.email) || null, `order:${orderId}`]
                    );
                } catch (_) {}
            }
            
            // Asignar order_number legible (misma que V1)
            const ymd = new Date().toISOString().slice(0, 10).replace(/-/g, '');
            const orderNumber = `ORD-${ymd}-${orderId}`;
            await client.query('UPDATE Orders SET order_number = $1 WHERE id = $2', [orderNumber, orderId]);

            return { orderId, orderNumber, buyerCode };
        });

        res.status(201).json(result);
    } catch (err) {
        console.error('Checkout V2 error', err.message);
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        res.status(500).json({ error: 'No se pudo crear la orden' });
    }
}

/**
 * Lista las últimas 200 órdenes V2 (incluyendo buyer_code).
 */
async function listOrdersV2(req, res) {
    try {
        const { rows } = await query(
            `SELECT id, order_number, buyer_code, buyer_name, buyer_email, buyer_phone,
                    total_amount::float AS total_amount, status, order_date
             FROM Orders
            WHERE deleted_at IS NULL
            ORDER BY id DESC
            LIMIT 200`
        );
        res.json(rows);
    } catch (err) {
        console.error('Error al listar pedidos V2:', err.message);
        res.status(500).json({ error: 'No se pudo obtener pedidos' });
    }
}

// --- Admin Endpoints: actualizar estado y eliminar (soft delete) ---

/**
 * Actualiza el estado de una orden.
 */
async function updateOrderStatus(req, res) {
    const id = Number(req.params.id);
    let status = String(req.body?.status || '').toUpperCase();
    if (status === 'CANCELLED') status = 'CANCELED';
    
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
    
    const allowed = new Set(['PENDING', 'PAID', 'DELIVERED', 'CANCELED']);
    if (!allowed.has(status)) return res.status(400).json({ error: 'Estado inválido' });

    try {
        const { rowCount } = await query(
            `UPDATE Orders SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL`,
            [status, id]
        );
        
        if (!rowCount) return res.status(404).json({ error: 'Orden no encontrada' });
        
        return res.json({ ok: true });
    } catch (err) {
        console.error('updateOrderStatus error:', err.message);
        return res.status(500).json({ error: 'No se pudo actualizar el estado' });
    }
}

/**
 * Elimina (soft delete) una orden, solo si está en estado 'DELIVERED'.
 */
async function deleteOrder(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

    try {
        // 1. Verificar existencia y estado
        const { rows } = await query(`SELECT status FROM Orders WHERE id = $1 AND deleted_at IS NULL`, [id]);
        if (!rows.length) return res.status(404).json({ error: 'Orden no encontrada' });
        
        const st = String(rows[0].status || '').toUpperCase();
        if (st !== 'DELIVERED') return res.status(400).json({ error: 'Solo se puede eliminar una orden entregada' });
        
        // 2. Ejecutar soft delete
        // Nota: Si el ORM/DB usa un trigger para convertir el DELETE en UPDATE deleted_at,
        // esto funcionará como soft delete. Si no, será un DELETE físico.
        const { rowCount } = await query(`UPDATE Orders SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL`, [id]);
        
        if (!rowCount) return res.status(404).json({ error: 'Orden no encontrada' });
        
        return res.json({ ok: true });
    } catch (err) {
        console.error('deleteOrder error:', err.message);
        return res.status(500).json({ error: 'No se pudo eliminar la orden' });
    }
}


// --- Exportaciones ---

module.exports = { 
    validateCheckout, 
    createOrder, 
    listOrders, 
    orderPdf,
    createOrderV2,
    listOrdersV2,
    updateOrderStatus,
    deleteOrder,
};
