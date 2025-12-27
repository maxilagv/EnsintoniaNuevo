const { check, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db/pg');

async function getProducts(req, res) {
  try {
    console.log("📡 getProducts: consulta iniciada");

    const { rows } = await query(
      `SELECT p.id,
              p.category_id,
              p.name,
              p.description,
              p.price::float AS price,
              COALESCE(p.image_url, p.image_file_path) AS image_url,
              c.name AS category_name,
              p.stock_quantity,
              p.specifications,
              p.discount_percent::float AS discount_percent,
              p.discount_start,
              p.discount_end,
              (
                CASE
                  WHEN p.discount_percent IS NOT NULL
                   AND (p.discount_start IS NULL OR p.discount_start <= NOW())
                   AND (p.discount_end   IS NULL OR p.discount_end   >= NOW())
                  THEN TRUE
                  ELSE FALSE
                END
              ) AS is_offer,
              (
                CASE
                  WHEN p.discount_percent IS NOT NULL
                   AND (p.discount_start IS NULL OR p.discount_start <= NOW())
                   AND (p.discount_end   IS NULL OR p.discount_end   >= NOW())
                  THEN ROUND(p.price * (1 - (p.discount_percent / 100.0)), 2)
                  ELSE p.price
                END
              )::float AS final_price,
              p.created_at,
              p.updated_at,
              p.deleted_at
         FROM Products p
         JOIN Categories c ON c.id = p.category_id
        WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
        ORDER BY p.id DESC
        LIMIT 100`
    );

    console.log("✅ getProducts: consulta exitosa");
    res.json(rows);
  } catch (err) {
    console.error("💥 Error exacto en getProducts:");
    console.error("Mensaje:", err.message);
    console.error("Detalle:", err.detail);
    console.error("Stack:", err.stack);
    res.status(500).json({ error: "Failed to fetch products" });
  }
}

async function getProductById(req, res) {
  const { id } = req.params || {};
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }
  try {
    const { rows } = await query(
      `SELECT p.id,
              p.category_id,
              p.name,
              p.description,
              p.price::float AS price,
              COALESCE(p.image_url, p.image_file_path) AS image_url,
              c.name AS category_name,
              p.stock_quantity,
              p.specifications,
              p.discount_percent::float AS discount_percent,
              p.discount_start,
              p.discount_end,
              (
                CASE
                  WHEN p.discount_percent IS NOT NULL
                   AND (p.discount_start IS NULL OR p.discount_start <= NOW())
                   AND (p.discount_end   IS NULL OR p.discount_end   >= NOW())
                  THEN TRUE
                  ELSE FALSE
                END
              ) AS is_offer,
              (
                CASE
                  WHEN p.discount_percent IS NOT NULL
                   AND (p.discount_start IS NULL OR p.discount_start <= NOW())
                   AND (p.discount_end   IS NULL OR p.discount_end   >= NOW())
                  THEN ROUND(p.price * (1 - (p.discount_percent / 100.0)), 2)
                  ELSE p.price
                END
              )::float AS final_price,
              p.created_at,
              p.updated_at,
              p.deleted_at
         FROM Products p
         JOIN Categories c ON c.id = p.category_id
        WHERE p.id = $1 AND p.deleted_at IS NULL AND c.deleted_at IS NULL
        LIMIT 1`,
      [idNum]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('Error fetching product by id:', err);
    return res.status(500).json({ error: 'Failed to fetch product' });
  }
}


// Validation (standard English payload)
const validateProduct = [
  check('name')
    .trim()
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 3, max: 100 }).withMessage('Name must be 3-100 chars'),
  check('description')
    .trim()
    .notEmpty().withMessage('Description is required')
    .isLength({ min: 10, max: 500 }).withMessage('Description must be 10-500 chars'),
  check('price')
    .notEmpty().withMessage('Price is required')
    .isFloat({ min: 0.01 }).withMessage('Price must be a positive number'),
  check('image_url')
    .trim()
    .notEmpty().withMessage('Image URL is required')
    .isURL().withMessage('Image URL must be valid'),
  check('category_id')
    .notEmpty().withMessage('category_id is required')
    .isInt({ min: 1 }).withMessage('category_id must be an integer >= 1'),
  check('stock_quantity')
    .optional()
    .isInt({ min: 0 }).withMessage('stock_quantity must be an integer >= 0'),
  check('specifications')
    .optional()
    .isString().withMessage('specifications must be a string')
];

// Validation específica para descuentos (ofertas)
const validateDiscount = [
  check('discount_percent')
    .optional({ nullable: true })
    .isFloat({ gt: 0, lt: 100 }).withMessage('discount_percent must be between 0 and 100'),
  check('discount_start')
    .optional({ nullable: true })
    .isISO8601().withMessage('discount_start must be a valid ISO8601 date'),
  check('discount_end')
    .optional({ nullable: true })
    .isISO8601().withMessage('discount_end must be a valid ISO8601 date'),
  check('duration_days')
    .optional({ nullable: true })
    .isInt({ gt: 0, lt: 366 }).withMessage('duration_days must be a positive integer (max 365)'),
];

async function createProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, description, price, image_url, category_id, stock_quantity, specifications } = req.body;

  try {
    const result = await withTransaction(async (client) => {
      // Ensure category exists
      const { rows: catRows } = await client.query('SELECT id FROM Categories WHERE id = $1', [category_id]);
      if (!catRows.length) {
        const e = new Error('Category not found');
        e.status = 400;
        throw e;
      }

      const initialStock = Number.isFinite(Number(stock_quantity)) && Number(stock_quantity) >= 0 ? Number(stock_quantity) : 0;
      const insProd = await client.query(
        `INSERT INTO Products(category_id, name, image_url, description, price, stock_quantity, specifications)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [Number(category_id), name, image_url, description, Number(price), initialStock, specifications ?? null]
      );
      return insProd.rows[0];
    });
    res.status(201).json({ id: result.id });
  } catch (err) {
    const code = err.status || 500;
    if (code === 400) return res.status(400).json({ error: err.message });
    console.error('Error creating product:', err);
    res.status(500).json({ error: 'Failed to create product' });
  }
}

async function updateProductDiscount(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params || {};
  const idNum = Number(id);
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return res.status(400).json({ error: 'Invalid product ID' });
  }

  const body = req.body || {};
  const hasPercentRaw = body.discount_percent;
  const hasPercent = hasPercentRaw !== undefined && hasPercentRaw !== null && String(hasPercentRaw) !== '';
  const percentNum = hasPercent ? Number(hasPercentRaw) : null;

  // Si no hay porcentaje válido, interpretamos que se quita la oferta
  if (!hasPercent || !Number.isFinite(percentNum) || percentNum <= 0) {
    try {
      const result = await query(
        `UPDATE Products
            SET discount_percent = NULL,
                discount_start   = NULL,
                discount_end     = NULL,
                updated_at       = CURRENT_TIMESTAMP
          WHERE id = $1 AND deleted_at IS NULL`,
        [idNum]
      );

      if (result.rowCount === 0) {
        const check = await query('SELECT id FROM Products WHERE id = $1', [idNum]);
        if (!check.rowCount) return res.status(404).json({ error: 'Product not found' });
      }

      return res.json({ message: 'Discount removed' });
    } catch (err) {
      console.error('Error removing product discount:', err);
      return res.status(500).json({ error: 'Failed to update product discount' });
    }
  }

  const percent = percentNum;
  let discountStart = null;
  let discountEnd = null;

  const now = new Date();
  const startRaw = body.discount_start;
  const endRaw = body.discount_end;
  const durationRaw = body.duration_days;

  if (startRaw) {
    const d = new Date(startRaw);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Invalid discount_start' });
    }
    discountStart = d;
  } else {
    // Si no se especifica inicio, asumimos "desde ahora"
    discountStart = now;
  }

  if (endRaw) {
    const d = new Date(endRaw);
    if (Number.isNaN(d.getTime())) {
      return res.status(400).json({ error: 'Invalid discount_end' });
    }
    discountEnd = d;
  } else if (durationRaw !== undefined && durationRaw !== null && String(durationRaw) !== '') {
    const days = Number(durationRaw);
    if (!Number.isInteger(days) || days <= 0) {
      return res.status(400).json({ error: 'Invalid duration_days' });
    }
    discountEnd = new Date(discountStart.getTime() + days * 24 * 60 * 60 * 1000);
  } else {
    // Sin fecha fin ni duración => oferta abierta
    discountEnd = null;
  }

  if (discountEnd && discountEnd <= discountStart) {
    return res.status(400).json({ error: 'discount_end must be after discount_start' });
  }

  try {
    const result = await query(
      `UPDATE Products
          SET discount_percent = $1,
              discount_start   = $2,
              discount_end     = $3,
              updated_at       = CURRENT_TIMESTAMP
        WHERE id = $4 AND deleted_at IS NULL`,
      [percent, discountStart, discountEnd, idNum]
    );

    if (result.rowCount === 0) {
      const check = await query('SELECT id FROM Products WHERE id = $1', [idNum]);
      if (!check.rowCount) return res.status(404).json({ error: 'Product not found' });
    }

    return res.json({
      message: 'Discount updated',
      discount_percent: percent,
      discount_start: discountStart,
      discount_end: discountEnd,
    });
  } catch (err) {
    console.error('Error updating product discount:', err);
    return res.status(500).json({ error: 'Failed to update product discount' });
  }
}

async function updateProduct(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { name, description, price, image_url, category_id, stock_quantity, specifications } = req.body;

  if (!id) {
    return res.status(400).json({ error: 'Product ID required for update' });
  }

  try {
    await withTransaction(async (client) => {
      // Ensure category exists
      const { rows: catRows } = await client.query('SELECT id FROM Categories WHERE id = $1', [category_id]);
      if (!catRows.length) {
        const e = new Error('Category not found');
        e.status = 400;
        throw e;
      }

      const newStock = Number.isFinite(Number(stock_quantity)) && Number(stock_quantity) >= 0 ? Number(stock_quantity) : undefined;
      if (newStock === undefined) {
        await client.query(
          `UPDATE Products
              SET category_id = $1,
                  name = $2,
                  image_url = $3,
                  description = $4,
                  price = $5,
                  specifications = $6,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $7`,
          [Number(category_id), name, image_url, description, Number(price), specifications ?? null, id]
        );
      } else {
        await client.query(
          `UPDATE Products
              SET category_id = $1,
                  name = $2,
                  image_url = $3,
                  description = $4,
                  price = $5,
                  stock_quantity = $6,
                  specifications = $7,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $8`,
          [Number(category_id), name, image_url, description, Number(price), newStock, specifications ?? null, id]
        );
      }
    });
    res.json({ message: 'Product updated successfully' });
  } catch (err) {
    const code = err.status || 500;
    if (code === 400) return res.status(400).json({ error: err.message });
    console.error('Error updating product:', err);
    res.status(500).json({ error: 'Failed to update product' });
  }
}

async function deleteProduct(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'Product ID required' });
  }

  try {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'Invalid product ID' });
    }

    // Soft delete to avoid DB trigger requiring superuser privileges
    const result = await query(
      `UPDATE Products
          SET deleted_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND deleted_at IS NULL`,
      [idNum]
    );

    if (result.rowCount === 0) {
      const check = await query('SELECT id FROM Products WHERE id = $1', [idNum]);
      if (!check.rowCount) return res.status(404).json({ error: 'Product not found' });
      // Already soft-deleted -> consider idempotent success
    }
    res.json({ message: 'Product deleted successfully' });
  } catch (err) {
    console.error('Error deleting product:', err);
    res.status(500).json({ error: 'Failed to delete product' });
  }
}

module.exports = {
  getProducts,
  getProductById,
  createProduct: [...validateProduct, createProduct],
  updateProduct: [...validateProduct, updateProduct],
  updateProductDiscount: [...validateDiscount, updateProductDiscount],
  deleteProduct,
  patchStock: [
    async function patchStock(req, res){
      const id = Number(req.params.id);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid product ID' });
      const delta = Number(req.body?.delta);
      if (!Number.isFinite(delta) || delta === 0) return res.status(400).json({ error: 'delta required' });
      const reason = req.body?.reason ? String(req.body.reason) : null;
      try {
        const result = await withTransaction(async (client) => {
          const { rows } = await client.query('SELECT stock_quantity FROM Products WHERE id = $1 FOR UPDATE', [id]);
          if (!rows.length) { const e = new Error('Product not found'); e.status = 404; throw e; }
          const current = Number(rows[0].stock_quantity || 0) || 0;
          // Asegurar que el cambio no deje el stock negativo
          let change = delta;
          if (current + change < 0) change = -current;

          // Aplicar cambio de stock usando adjust_product_stock (respeta trigger de BD)
          if (change !== 0) {
            await client.query(
              'SELECT adjust_product_stock($1, $2, $3, $4, $5, $6)',
              [
                id,
                change,
                change > 0 ? 'entrada' : 'salida',
                reason || 'stock patch',
                (req.user && req.user.id) || null,
                req.ip || null
              ]
            );

            // Registrar tambi�n en movimientos (legado)
            const tipo = change > 0 ? 'compra' : 'venta';
            const qty = Math.abs(Math.floor(change));
            if (qty > 0) {
              await client.query(
                `INSERT INTO movimientos(tipo, producto_id, cantidad, precio_unitario, usuario, nota)
                 VALUES ($1, $2, $3, 0, $4, $5)`,
                [tipo, id, qty, (req.user && req.user.email) || null, reason || 'stock patch']
              );
            }
          }

          const { rows: rowsAfter } = await client.query('SELECT stock_quantity FROM Products WHERE id = $1', [id]);
          const next = rowsAfter.length ? (Number(rowsAfter[0].stock_quantity || 0) || 0) : current;
          return { old: current, new: next };
        });
        return res.json(result);
      } catch (err) {
        const code = err.status || 500;
        if (code !== 500) return res.status(code).json({ error: err.message });
        console.error('patchStock error:', err.message);
        return res.status(500).json({ error: 'Failed to patch stock' });
      }
    }
  ]
};
