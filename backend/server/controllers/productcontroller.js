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
              p.created_at,
              p.updated_at,
              p.deleted_at
         FROM products p
         JOIN categories c ON c.id = p.category_id
        WHERE p.deleted_at IS NULL AND c.deleted_at IS NULL
        ORDER BY p.id DESC`
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
  createProduct: [...validateProduct, createProduct],
  updateProduct: [...validateProduct, updateProduct],
  deleteProduct
};
