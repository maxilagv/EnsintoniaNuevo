const { query, withTransaction } = require('../db/pg');

async function listContactMessages(req, res) {
  try {
    const { rows } = await query(
      `SELECT id, name, email, phone, message, created_at
         FROM ContactMessages
        ORDER BY id DESC
        LIMIT 500`
    );
    res.json(rows);
  } catch (err) {
    console.error('Error al listar mensajes de contacto:', err.message);
    res.status(500).json({ error: 'No se pudieron obtener los mensajes' });
  }
}

async function deleteContactMessage(req, res) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'ID inválido' });
    }
    const result = await query('DELETE FROM ContactMessages WHERE id = $1', [id]);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Mensaje no encontrado' });
    }
    res.json({ message: 'Mensaje eliminado' });
  } catch (err) {
    console.error('Error al eliminar mensaje de contacto:', err.message);
    res.status(500).json({ error: 'No se pudo eliminar el mensaje' });
  }
}

// --- Resumen de ventas por vendedor (para comisiones) ---
async function salesBySeller(req, res) {
  try {
    const fromRaw = req.query?.from;
    const toRaw = req.query?.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;

    const params = [];
    let where = `o.deleted_at IS NULL AND o.seller_user_id IS NOT NULL AND o.status <> 'CANCELED'`;
    if (from && !isNaN(from.getTime())) {
      params.push(from.toISOString());
      where += ` AND o.order_date >= $${params.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      params.push(to.toISOString());
      where += ` AND o.order_date <= $${params.length}`;
    }

    const { rows } = await query(
      `SELECT
         o.seller_user_id AS seller_id,
         u.name AS seller_name,
         u.username AS seller_username,
         u.commission_rate AS commission_rate,
         COUNT(DISTINCT o.id) AS orders_count,
         COALESCE(SUM(oi.quantity), 0) AS products_sold,
         COALESCE(SUM(o.total_amount), 0)::float AS total_amount
       FROM Orders o
       LEFT JOIN Users u ON u.id = o.seller_user_id
       LEFT JOIN OrderItems oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
       WHERE ${where}
       GROUP BY o.seller_user_id, u.name, u.username, u.commission_rate
       ORDER BY total_amount DESC, seller_id ASC`,
      params
    );

    const result = rows.map((r) => ({
      sellerId: r.seller_id,
      sellerName: r.seller_name || null,
      sellerUsername: r.seller_username || null,
      commissionRate: r.commission_rate != null ? Number(r.commission_rate) : null,
      ordersCount: Number(r.orders_count || 0),
      productsSold: Number(r.products_sold || 0),
      totalAmount: Number(r.total_amount || 0),
    }));

    return res.json(result);
  } catch (err) {
    console.error('salesBySeller error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener ventas por vendedor' });
  }
}

async function salesBySellerDetail(req, res) {
  try {
    const sellerId = Number(req.params.sellerId);
    if (!Number.isInteger(sellerId) || sellerId <= 0) {
      return res.status(400).json({ error: 'sellerId inv�lido' });
    }
    const fromRaw = req.query?.from;
    const toRaw = req.query?.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;

    const baseParams = [sellerId];
    let where = `o.deleted_at IS NULL AND o.seller_user_id = $1 AND o.status <> 'CANCELED'`;
    if (from && !isNaN(from.getTime())) {
      baseParams.push(from.toISOString());
      where += ` AND o.order_date >= $${baseParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      baseParams.push(to.toISOString());
      where += ` AND o.order_date <= $${baseParams.length}`;
    }

    const [sellerInfoRes, topProductsRes, recentOrdersRes] = await Promise.all([
      query('SELECT id, name, username FROM Users WHERE id = $1 AND deleted_at IS NULL', [sellerId]),
      query(
        `SELECT
           p.id AS product_id,
           p.name AS product_name,
           COALESCE(SUM(oi.quantity),0) AS quantity,
           COALESCE(SUM(oi.quantity * oi.unit_price),0)::float AS total_amount
         FROM Orders o
         JOIN OrderItems oi ON oi.order_id = o.id AND oi.deleted_at IS NULL
         JOIN Products p ON p.id = oi.product_id
         WHERE ${where}
         GROUP BY p.id, p.name
         ORDER BY total_amount DESC, quantity DESC, product_id ASC
         LIMIT 5`,
        baseParams
      ),
      query(
        `SELECT
           o.id,
           o.order_number,
           o.order_date,
           o.status,
           COALESCE(o.total_amount,0)::float AS total_amount
         FROM Orders o
         WHERE ${where}
         ORDER BY o.order_date DESC, o.id DESC
         LIMIT 5`,
        baseParams
      ),
    ]);

    const sellerRow = sellerInfoRes.rows[0] || null;
    const topProducts = topProductsRes.rows.map((r) => ({
      productId: r.product_id,
      productName: r.product_name || null,
      quantity: Number(r.quantity || 0),
      totalAmount: Number(r.total_amount || 0),
    }));
    const recentOrders = recentOrdersRes.rows.map((r) => ({
      orderId: r.id,
      orderNumber: r.order_number || null,
      orderDate: r.order_date,
      status: r.status || null,
      totalAmount: Number(r.total_amount || 0),
    }));

    return res.json({
      sellerId,
      sellerName: sellerRow ? (sellerRow.name || null) : null,
      sellerUsername: sellerRow ? (sellerRow.username || null) : null,
      from: fromRaw || null,
      to: toRaw || null,
      topProducts,
      recentOrders,
    });
  } catch (err) {
    console.error('salesBySellerDetail error:', err.message);
    return res.status(500).json({ error: 'No se pudo obtener el detalle del vendedor' });
  }
}

module.exports = { listContactMessages, deleteContactMessage, salesBySeller, salesBySellerDetail };

// --- Compras (ingreso de stock) ---
async function createPurchase(req, res) {
  const body = req.body || {};
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) return res.status(400).json({ error: 'items requeridos' });
  const usuario = (req.user && req.user.email) || null;
  const notes = body.notes || body.nota || null;
  const currency = (body.currency || 'ARS').toUpperCase();
  const supplier = body.supplier || null; // { id? , name, cuit, contact_* }
  const supplierIdRaw = Number(body.supplier_id || body.supplierId);

  try {
    const result = await withTransaction(async (client) => {
      // 1) Upsert supplier if needed
      let supplierId = Number.isInteger(supplierIdRaw) && supplierIdRaw > 0 ? supplierIdRaw : null;
      if (!supplierId && supplier && (supplier.name || supplier.cuit)) {
        const name = String(supplier.name || 'Proveedor').trim();
        const cuit = supplier.cuit ? String(supplier.cuit).trim() : null;
        const contact_name = supplier.contact_name || supplier.contactName || null;
        const contact_phone = supplier.contact_phone || supplier.contactPhone || null;
        const contact_email = supplier.contact_email || supplier.contactEmail || null;
        if (cuit) {
          const { rows } = await client.query('SELECT id FROM Suppliers WHERE cuit = $1 AND deleted_at IS NULL', [cuit]);
          if (rows.length) supplierId = rows[0].id;
        }
        if (!supplierId) {
          const ins = await client.query(
            `INSERT INTO Suppliers(name, cuit, contact_name, contact_phone, contact_email)
             VALUES ($1,$2,$3,$4,$5) RETURNING id`,
            [name, cuit, contact_name, contact_phone, contact_email]
          );
          supplierId = ins.rows[0].id;
        }
      }

      // 2) Validate items and compute total
      let total = 0;
      const normItems = [];
      for (const it of items) {
        const productId = Number(it.product_id || it.productId);
        const quantity = Number(it.quantity || it.cantidad);
        const unitCost = Number(it.unit_cost || it.precio_unitario || it.precio || it.cost);
        if (!Number.isInteger(productId) || productId <= 0) { const e = new Error('product_id inv�lido'); e.status = 400; throw e; }
        if (!Number.isFinite(quantity) || quantity <= 0) { const e = new Error('quantity inv�lida'); e.status = 400; throw e; }
        if (!Number.isFinite(unitCost) || unitCost <= 0) { const e = new Error('unit_cost inv�lido'); e.status = 400; throw e; }
        total += unitCost * quantity;
        normItems.push({ productId, quantity: Math.floor(quantity), unitCost });
      }

      // 3) Insert purchase
      const status = String(body.status || 'RECEIVED').toUpperCase();
      const insPur = await client.query(
        `INSERT INTO Purchases(supplier_id, status, currency, total_amount, notes)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [supplierId || null, status, currency, total, notes]
      );
      const purchaseId = insPur.rows[0].id;

      // 4) Insert items, increase stock (via adjust_product_stock), register movimientos legacy
      for (const it of normItems) {
        await client.query(
          `INSERT INTO PurchaseItems(purchase_id, product_id, quantity, unit_cost)
           VALUES ($1,$2,$3,$4)`,
          [purchaseId, it.productId, it.quantity, it.unitCost]
        );

        await client.query(
          'SELECT adjust_product_stock($1, $2, $3, $4, $5, $6)',
          [
            it.productId,                                  // p_product_id
            it.quantity,                                   // p_quantity_change (positivo = entrada)
            'entrada',                                     // p_movement_type
            notes ? `purchase:${purchaseId} ${notes}` : `purchase:${purchaseId}`, // p_reason
            (req.user && req.user.id) || null,            // p_current_user_id
            req.ip || null                                 // p_client_ip_address
          ]
        );

        await client.query(
          `INSERT INTO movimientos(tipo, producto_id, cantidad, precio_unitario, usuario, nota)
           VALUES ('compra', $1, $2, $3, $4, $5)`,
          [it.productId, it.quantity, it.unitCost, usuario, notes ? `purchase:${purchaseId} ${notes}` : `purchase:${purchaseId}`]
        );
      }

      return { id: purchaseId, total, status };
    });
    try {
      await query(
        `INSERT INTO AuditLog(actor, action, entity_type, entity_id, meta)
         VALUES ($1, $2, 'PURCHASE', $3, $4)`,
        [(req.user && req.user.email) || null, 'PURCHASE_CREATE', result.id, JSON.stringify({ total: result.total, status: result.status })]
      );
    } catch(_) {}
    return res.status(201).json(result);
  } catch (err) {
    const code = err.status || 500;
    if (code !== 500) return res.status(code).json({ error: err.message });
    console.error('Error en createPurchase:', err.message);
    return res.status(500).json({ error: 'No se pudo registrar la compra' });
  }
}

async function listPurchases(req, res) {
  try {
    const { rows: p } = await query(
      `SELECT pu.id, pu.purchase_date, pu.status, pu.currency, pu.total_amount::float AS total_amount,
              s.id AS supplier_id, s.name AS supplier_name, s.cuit AS supplier_cuit
         FROM Purchases pu
         LEFT JOIN Suppliers s ON s.id = pu.supplier_id
        WHERE pu.deleted_at IS NULL
        ORDER BY pu.id DESC
        LIMIT 200`
    );
    if (!p.length) return res.json([]);
    const ids = p.map(x => x.id);
    const { rows: items } = await query(
      `SELECT pi.purchase_id, pi.quantity, pi.unit_cost::float AS unit_cost, pr.name
         FROM PurchaseItems pi
         JOIN Products pr ON pr.id = pi.product_id
        WHERE pi.purchase_id = ANY($1::int[])`,
      [ids]
    );
    const grouped = new Map();
    for (const it of items) {
      if (!grouped.has(it.purchase_id)) grouped.set(it.purchase_id, []);
      grouped.get(it.purchase_id).push({ name: it.name, quantity: it.quantity, unit_cost: it.unit_cost });
    }
    const result = p.map(h => ({ ...h, items: grouped.get(h.id) || [] }));
    return res.json(result);
  } catch (err) {
    console.error('listPurchases error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener compras' });
  }
}

async function getPurchase(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inv�lido' });
  try {
    const { rows: h } = await query(
      `SELECT pu.id, pu.purchase_date, pu.status, pu.currency, pu.total_amount::float AS total_amount, pu.notes,
              s.id AS supplier_id, s.name AS supplier_name, s.cuit AS supplier_cuit,
              s.contact_name, s.contact_phone, s.contact_email
         FROM Purchases pu
         LEFT JOIN Suppliers s ON s.id = pu.supplier_id
        WHERE pu.id = $1 AND pu.deleted_at IS NULL`,
      [id]
    );
    if (!h.length) return res.status(404).json({ error: 'Compra no encontrada' });
    const { rows: items } = await query(
      `SELECT pi.quantity, pi.unit_cost::float AS unit_cost, pr.name, pr.id AS product_id
         FROM PurchaseItems pi
         JOIN Products pr ON pr.id = pi.product_id
        WHERE pi.purchase_id = $1`,
      [id]
    );
    return res.json({ ...h[0], items });
  } catch (err) {
    console.error('getPurchase error:', err.message);
    return res.status(500).json({ error: 'No se pudo obtener la compra' });
  }
}

async function updatePurchaseStatus(req, res) {
  const id = Number(req.params.id);
  let status = String(req.body?.status || '').toUpperCase();
  const allowed = new Set(['DRAFT','CONFIRMED','RECEIVED','CANCELED']);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inv�lido' });
  if (!allowed.has(status)) return res.status(400).json({ error: 'Estado inv�lido' });
  try {
    const { rowCount } = await query(
      `UPDATE Purchases SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 AND deleted_at IS NULL`,
      [status, id]
    );
    if (!rowCount) return res.status(404).json({ error: 'Compra no encontrada' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('updatePurchaseStatus error:', err.message);
    return res.status(500).json({ error: 'No se pudo actualizar el estado' });
  }
}

async function deletePurchase(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inv�lido' });
  try {
    const { rows } = await query(`SELECT status FROM Purchases WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!rows.length) return res.status(404).json({ error: 'Compra no encontrada' });
    const st = String(rows[0].status||'').toUpperCase();
    if (st !== 'CANCELED') return res.status(400).json({ error: 'Solo se puede eliminar una compra cancelada' });
    const { rowCount } = await query(`UPDATE Purchases SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND deleted_at IS NULL`, [id]);
    if (!rowCount) return res.status(404).json({ error: 'Compra no encontrada' });
    return res.json({ ok: true });
  } catch (err) {
    console.error('deletePurchase error:', err.message);
    return res.status(500).json({ error: 'No se pudo eliminar la compra' });
  }
}

// --- Analítica simple (ingresos vs compras) ---
async function analyticsOverview(req, res) {
  try {
    const fromRaw = req.query?.from;
    const toRaw = req.query?.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;

    const orderParams = [];
    let ordersWhere = 'deleted_at IS NULL';
    if (from && !isNaN(from.getTime())) {
      orderParams.push(from.toISOString());
      ordersWhere += ` AND order_date >= $${orderParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      orderParams.push(to.toISOString());
      ordersWhere += ` AND order_date <= $${orderParams.length}`;
    }

    const purchaseParams = [];
    let purchasesWhere = 'deleted_at IS NULL';
    if (from && !isNaN(from.getTime())) {
      purchaseParams.push(from.toISOString());
      purchasesWhere += ` AND purchase_date >= $${purchaseParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      purchaseParams.push(to.toISOString());
      purchasesWhere += ` AND purchase_date <= $${purchaseParams.length}`;
    }

    const [revRes, purRes] = await Promise.all([
      query(`SELECT COALESCE(SUM(total_amount),0)::float AS revenue FROM Orders WHERE ${ordersWhere}`, orderParams),
      query(`SELECT COALESCE(SUM(total_amount),0)::float AS purchases FROM Purchases WHERE ${purchasesWhere}`, purchaseParams),
    ]);

    const revenue = Number(revRes.rows?.[0]?.revenue || 0);
    const purchases = Number(purRes.rows?.[0]?.purchases || 0);
    const gross = revenue - purchases;

    return res.json({ revenue, purchases, gross });
  } catch (err) {
    console.error('analyticsOverview error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener métricas' });
  }
}
module.exports.createPurchase = createPurchase;
module.exports.listPurchases = listPurchases;
module.exports.getPurchase = getPurchase;
module.exports.updatePurchaseStatus = updatePurchaseStatus;
module.exports.deletePurchase = deletePurchase;
module.exports.analyticsOverview = analyticsOverview;
module.exports.analyticsFinance = analyticsFinanceDetailed;
module.exports.listExtraExpenses = listExtraExpenses;
module.exports.createExtraExpense = createExtraExpense;
module.exports.updateExtraExpense = updateExtraExpense;
module.exports.deleteExtraExpense = deleteExtraExpense;

// --- Anal�tica avanzada de finanzas (ingreso bruto / neto / gastos) ---
async function analyticsFinance(req, res) {
  try {
    const fromRaw = req.query?.from;
    const toRaw = req.query?.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;

    // Normaliza la comisi�n de vendedores a un porcentaje (0-1)
    let commissionRate = Number(process.env.SELLER_COMMISSION_RATE || '0.05');
    if (!Number.isFinite(commissionRate) || commissionRate < 0) commissionRate = 0;
    if (commissionRate > 1 && commissionRate <= 100) {
      commissionRate = commissionRate / 100;
    }

    // Ingreso bruto (ventas) - excluye pedidos cancelados
    const orderParams = [];
    let ordersWhere = `o.deleted_at IS NULL AND o.status <> 'CANCELED'`;
    if (from && !isNaN(from.getTime())) {
      orderParams.push(from.toISOString());
      ordersWhere += ` AND o.order_date >= $${orderParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      orderParams.push(to.toISOString());
      ordersWhere += ` AND o.order_date <= $${orderParams.length}`;
    }

    // Gastos de stock (compras)
    const purchaseParams = [];
    let purchasesWhere = 'pu.deleted_at IS NULL';
    if (from && !isNaN(from.getTime())) {
      purchaseParams.push(from.toISOString());
      purchasesWhere += ` AND pu.purchase_date >= $${purchaseParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      purchaseParams.push(to.toISOString());
      purchasesWhere += ` AND pu.purchase_date <= $${purchaseParams.length}`;
    }

    // Gastos extraordinarios
    const extraParams = [];
    let extraWhere = 'ee.deleted_at IS NULL';
    if (from && !isNaN(from.getTime())) {
      extraParams.push(from.toISOString());
      extraWhere += ` AND ee.expense_date >= $${extraParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      extraParams.push(to.toISOString());
      extraWhere += ` AND ee.expense_date <= $${extraParams.length}`;
    }

    // Ventas atribuibles a vendedores (base para salarios / comisiones)
    const salaryParams = [];
    let salaryWhere = `o.deleted_at IS NULL AND o.seller_user_id IS NOT NULL AND o.status <> 'CANCELED'`;
    if (from && !isNaN(from.getTime())) {
      salaryParams.push(from.toISOString());
      salaryWhere += ` AND o.order_date >= $${salaryParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      salaryParams.push(to.toISOString());
      salaryWhere += ` AND o.order_date <= $${salaryParams.length}`;
    }

    const [ordersRes, purchasesRes, extraRes, salaryRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(o.total_amount),0)::float AS gross_income
           FROM Orders o
          WHERE ${ordersWhere}`,
        orderParams
      ),
      query(
        `SELECT COALESCE(SUM(pu.total_amount),0)::float AS stock_expenses
           FROM Purchases pu
          WHERE ${purchasesWhere}`,
        purchaseParams
      ),
      query(
        `SELECT COALESCE(SUM(ee.amount),0)::float AS extra_expenses
           FROM ExtraExpenses ee
          WHERE ${extraWhere}`,
        extraParams
      ),
      query(
        `SELECT COALESCE(SUM(o.total_amount),0)::float AS total_sales_for_sellers
           FROM Orders o
          WHERE ${salaryWhere}`,
        salaryParams
      ),
    ]);

    const grossIncome = Number(ordersRes.rows?.[0]?.gross_income || 0);
    const stockExpenses = Number(purchasesRes.rows?.[0]?.stock_expenses || 0);
    const extraExpenses = Number(extraRes.rows?.[0]?.extra_expenses || 0);
    const totalSalesForSellers = Number(salaryRes.rows?.[0]?.total_sales_for_sellers || 0);
    const salaryExpenses = totalSalesForSellers * commissionRate;

    const totalExpenses = stockExpenses + salaryExpenses + extraExpenses;
    const netIncome = grossIncome - totalExpenses;

    return res.json({
      grossIncome,
      stockExpenses,
      salaryExpenses,
      extraExpenses,
      totalExpenses,
      netIncome,
      commissionRate,
    });
  } catch (err) {
    console.error('analyticsFinance error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener m�tricas de finanzas' });
  }
}

// --- Gastos extraordinarios (ExtraExpenses) ---
async function listExtraExpenses(req, res) {
  try {
    const fromRaw = req.query?.from;
    const toRaw = req.query?.to;
    const categoryFilter = req.query?.category;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;

    const params = [];
    let where = 'ee.deleted_at IS NULL';
    if (from && !isNaN(from.getTime())) {
      params.push(from.toISOString());
      where += ` AND ee.expense_date >= $${params.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      params.push(to.toISOString());
      where += ` AND ee.expense_date <= $${params.length}`;
    }
    if (categoryFilter) {
      params.push(String(categoryFilter));
      where += ` AND ee.category = $${params.length}`;
    }

    const { rows } = await query(
      `SELECT
         ee.id,
         ee.expense_date,
         ee.amount::float AS amount,
         ee.description,
         ee.category,
         ee.notes,
         ee.created_by
       FROM ExtraExpenses ee
      WHERE ${where}
      ORDER BY ee.expense_date DESC, ee.id DESC
      LIMIT 500`,
      params
    );

    const result = rows.map((r) => ({
      id: r.id,
      expenseDate: r.expense_date,
      amount: Number(r.amount || 0),
      description: r.description || null,
      category: r.category || null,
      notes: r.notes || null,
      createdBy: r.created_by || null,
    }));

    return res.json(result);
  } catch (err) {
    console.error('listExtraExpenses error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener los gastos extraordinarios' });
  }
}

async function createExtraExpense(req, res) {
  try {
    const body = req.body || {};
    const rawAmount = body.amount ?? body.monto;
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'amount inv�lido' });
    }

    const dateRaw = body.date || body.expense_date || body.fecha;
    let expenseDate = null;
    if (dateRaw) {
      const d = new Date(dateRaw);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'fecha inv�lida' });
      }
      expenseDate = d.toISOString();
    }

    const description = body.description ? String(body.description).trim() : null;
    const category = body.category ? String(body.category).trim() : null;
    const notes = body.notes ? String(body.notes).trim() : body.observaciones ? String(body.observaciones).trim() : null;
    const createdBy = (req.user && req.user.id) || null;

    const { rows } = await query(
      `INSERT INTO ExtraExpenses(expense_date, amount, description, category, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, expense_date, amount::float AS amount, description, category, notes, created_by`,
      [
        expenseDate || new Date().toISOString(),
        amount,
        description,
        category,
        notes,
        createdBy,
      ]
    );

    const r = rows[0];
    const result = {
      id: r.id,
      expenseDate: r.expense_date,
      amount: Number(r.amount || 0),
      description: r.description || null,
      category: r.category || null,
      notes: r.notes || null,
      createdBy: r.created_by || null,
    };

    return res.status(201).json(result);
  } catch (err) {
    console.error('createExtraExpense error:', err.message);
    return res.status(500).json({ error: 'No se pudo crear el gasto extraordinario' });
  }
}

async function updateExtraExpense(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inv�lido' });
  }

  try {
    const body = req.body || {};
    const fields = [];
    const params = [];

    if (body.amount != null || body.monto != null) {
      const rawAmount = body.amount ?? body.monto;
      const amount = Number(rawAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return res.status(400).json({ error: 'amount inv�lido' });
      }
      params.push(amount);
      fields.push(`amount = $${params.length}`);
    }

    if (body.date || body.expense_date || body.fecha) {
      const dateRaw = body.date || body.expense_date || body.fecha;
      const d = new Date(dateRaw);
      if (isNaN(d.getTime())) {
        return res.status(400).json({ error: 'fecha inv�lida' });
      }
      params.push(d.toISOString());
      fields.push(`expense_date = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
      params.push(body.description ? String(body.description).trim() : null);
      fields.push(`description = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
      params.push(body.category ? String(body.category).trim() : null);
      fields.push(`category = $${params.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'notes') || Object.prototype.hasOwnProperty.call(body, 'observaciones')) {
      const notes = body.notes != null ? body.notes : body.observaciones;
      params.push(notes ? String(notes).trim() : null);
      fields.push(`notes = $${params.length}`);
    }

    if (!fields.length) {
      return res.status(400).json({ error: 'No hay campos para actualizar' });
    }

    params.push(id);
    const sql = `
      UPDATE ExtraExpenses
         SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP
       WHERE id = $${params.length} AND deleted_at IS NULL
       RETURNING id, expense_date, amount::float AS amount, description, category, notes, created_by
    `;
    const { rows, rowCount } = await query(sql, params);
    if (!rowCount) {
      return res.status(404).json({ error: 'Gasto extraordinario no encontrado' });
    }

    const r = rows[0];
    const result = {
      id: r.id,
      expenseDate: r.expense_date,
      amount: Number(r.amount || 0),
      description: r.description || null,
      category: r.category || null,
      notes: r.notes || null,
      createdBy: r.created_by || null,
    };

    return res.json(result);
  } catch (err) {
    console.error('updateExtraExpense error:', err.message);
    return res.status(500).json({ error: 'No se pudo actualizar el gasto extraordinario' });
  }
}

async function deleteExtraExpense(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inv�lido' });
  }

  try {
    const { rowCount } = await query(
      `UPDATE ExtraExpenses
          SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL`,
      [id]
    );
    if (!rowCount) {
      return res.status(404).json({ error: 'Gasto extraordinario no encontrado' });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error('deleteExtraExpense error:', err.message);
    return res.status(500).json({ error: 'No se pudo eliminar el gasto extraordinario' });
  }
}

// Versi?n detallada de anal?tica financiera que usa la comisi?n por vendedor
// (Users.commission_rate) con respaldo en la tasa global SELLER_COMMISSION_RATE.
async function analyticsFinanceDetailed(req, res) {
  try {
    const fromRaw = req.query?.from;
    const toRaw = req.query?.to;
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;

    // Normaliza la comisi?n global de vendedores a un porcentaje (0-1)
    let commissionRate = Number(process.env.SELLER_COMMISSION_RATE || '0.05');
    if (!Number.isFinite(commissionRate) || commissionRate < 0) commissionRate = 0;
    if (commissionRate > 1 && commissionRate <= 100) {
      commissionRate = commissionRate / 100;
    }

    // Ingreso bruto (ventas) - excluye pedidos cancelados
    const orderParams = [];
    let ordersWhere = `o.deleted_at IS NULL AND o.status <> 'CANCELED'`;
    if (from && !isNaN(from.getTime())) {
      orderParams.push(from.toISOString());
      ordersWhere += ` AND o.order_date >= $${orderParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      orderParams.push(to.toISOString());
      ordersWhere += ` AND o.order_date <= $${orderParams.length}`;
    }

    // Gastos de stock (compras)
    const purchaseParams = [];
    let purchasesWhere = 'pu.deleted_at IS NULL';
    if (from && !isNaN(from.getTime())) {
      purchaseParams.push(from.toISOString());
      purchasesWhere += ` AND pu.purchase_date >= $${purchaseParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      purchaseParams.push(to.toISOString());
      purchasesWhere += ` AND pu.purchase_date <= $${purchaseParams.length}`;
    }

    // Gastos extraordinarios
    const extraParams = [];
    let extraWhere = 'ee.deleted_at IS NULL';
    if (from && !isNaN(from.getTime())) {
      extraParams.push(from.toISOString());
      extraWhere += ` AND ee.expense_date >= $${extraParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      extraParams.push(to.toISOString());
      extraWhere += ` AND ee.expense_date <= $${extraParams.length}`;
    }

    // Ventas atribuibles a vendedores (base para salarios / comisiones)
    // Usa la comisi?n personalizada del usuario si existe, con fallback a la global.
    const salaryParams = [commissionRate];
    let salaryWhere = `o.deleted_at IS NULL AND o.seller_user_id IS NOT NULL AND o.status <> 'CANCELED'`;
    if (from && !isNaN(from.getTime())) {
      salaryParams.push(from.toISOString());
      salaryWhere += ` AND o.order_date >= $${salaryParams.length}`;
    }
    if (to && !isNaN(to.getTime())) {
      salaryParams.push(to.toISOString());
      salaryWhere += ` AND o.order_date <= $${salaryParams.length}`;
    }

    const [ordersRes, purchasesRes, extraRes, salaryRes] = await Promise.all([
      query(
        `SELECT COALESCE(SUM(o.total_amount),0)::float AS gross_income
           FROM Orders o
          WHERE ${ordersWhere}`,
        orderParams
      ),
      query(
        `SELECT COALESCE(SUM(pu.total_amount),0)::float AS stock_expenses
           FROM Purchases pu
          WHERE ${purchasesWhere}`,
        purchaseParams
      ),
      query(
        `SELECT COALESCE(SUM(ee.amount),0)::float AS extra_expenses
           FROM ExtraExpenses ee
          WHERE ${extraWhere}`,
        extraParams
      ),
      query(
        `SELECT
           COALESCE(SUM(o.total_amount),0)::float AS total_sales_for_sellers,
           COALESCE(SUM(o.total_amount * COALESCE(u.commission_rate, $1)),0)::float AS salary_expenses
         FROM Orders o
         LEFT JOIN Users u ON u.id = o.seller_user_id
        WHERE ${salaryWhere}`,
        salaryParams
      ),
    ]);

    const grossIncome = Number(ordersRes.rows?.[0]?.gross_income || 0);
    const stockExpenses = Number(purchasesRes.rows?.[0]?.stock_expenses || 0);
    const extraExpenses = Number(extraRes.rows?.[0]?.extra_expenses || 0);
    const totalSalesForSellers = Number(salaryRes.rows?.[0]?.total_sales_for_sellers || 0);
    const salaryExpenses = Number(salaryRes.rows?.[0]?.salary_expenses || 0);

    const totalExpenses = stockExpenses + salaryExpenses + extraExpenses;
    const netIncome = grossIncome - totalExpenses;

    return res.json({
      grossIncome,
      stockExpenses,
      salaryExpenses,
      extraExpenses,
      totalExpenses,
      netIncome,
      commissionRate,
    });
  } catch (err) {
    console.error('analyticsFinanceDetailed error:', err.message);
    return res.status(500).json({ error: 'No se pudieron obtener m?tricas de finanzas' });
  }
}
