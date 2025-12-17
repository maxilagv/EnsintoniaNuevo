const { check, validationResult } = require('express-validator');
const { query, withTransaction } = require('../db/pg');
const { audit } = require('../utils/audit');

// Obtener categorías (estandarizado en inglés)
async function getCategorias(req, res) {
  try {
    const { rows } = await query(
      `SELECT id,
              name,
              COALESCE(image_url, image_file_path) AS image_url,
              description
         FROM Categories
        WHERE deleted_at IS NULL
        ORDER BY name ASC
        LIMIT 200`
    );
    res.json(rows);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de la categoria ya existe' });
    }
    console.error('Error al obtener categorías:', err);
    res.status(500).json({ error: 'No se pudo obtener categorías' });
  }
}

// Reglas de validación (inglés)
const validateCategory = [
  check('name')
    .trim()
    .notEmpty().withMessage('El nombre es obligatorio')
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  check('image_url')
    .trim()
    .notEmpty().withMessage('La imagen es obligatoria'),
  check('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('La descripción es demasiado larga')
];

// Validación específica para actualización: todos los campos opcionales
// y se permite URL http(s) o una ruta de archivo
const validateCategoryUpdate = [
  check('name')
    .optional()
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('El nombre debe tener entre 2 y 100 caracteres'),
  check('image_url')
    .optional()
    .trim(),
  check('description')
    .optional()
    .isLength({ max: 2000 }).withMessage('La descripción es demasiado larga')
];

// Crear categoría
async function createCategoria(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validación fallida en createCategoria:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { name, image_url, description } = req.body;

  try {
    // Decidir destino de imagen según sea URL http(s) o ruta
    const normName = String(name || '').trim();
    const v = String(image_url || '').trim();
    const isHttpUrl = /^https?:\/\//i.test(v);
    const imgUrlVal = isHttpUrl ? v : null;
    const imgFileVal = isHttpUrl ? null : v;

    // Restaurar si existe soft-deleted con el mismo nombre
    const existing = await query(
      'SELECT id, deleted_at FROM Categories WHERE LOWER(name) = LOWER($1) LIMIT 1',
      [normName]
    );
    if (existing.rowCount) {
      const row = existing.rows[0];
      if (row.deleted_at) {
        const upd = await query(
          `UPDATE Categories
              SET image_url = $1,
                  image_file_path = $2,
                  description = $3,
                  deleted_at = NULL,
                  updated_at = CURRENT_TIMESTAMP
            WHERE id = $4 RETURNING id`,
          [imgUrlVal, imgFileVal, description || null, row.id]
        );
        return res.status(200).json({ id: upd.rows[0].id, restored: true });
      } else {
        return res.status(409).json({ error: 'El nombre de la categoria ya existe' });
      }
    }

    const { rows } = await query(
      'INSERT INTO Categories(name, image_url, image_file_path, description) VALUES ($1, $2, $3, $4) RETURNING id',
      [normName, imgUrlVal, imgFileVal, description || null]
    );
    res.status(201).json({ id: rows[0].id });
  } catch (err) {
    console.error('Error al crear categoría:', err);
    res.status(500).json({ error: 'No se pudo crear la categoría' });
  }
}

// Actualizar categoría
async function updateCategoria(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    console.error('Validación fallida en updateCategoria:', errors.array());
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { name, image_url, description } = req.body || {};

  if (!id) {
    return res.status(400).json({ error: 'ID de la categoría requerido para actualizar' });
  }

  try {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }

    // Obtener valores actuales para decidir imagen
    const current = await query('SELECT image_url, image_file_path FROM Categories WHERE id = $1', [idNum]);
    if (current.rowCount === 0) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }
    const cur = current.rows[0];

    // Decidir destino de imagen
    let newImageUrl = cur.image_url || null;
    let newImageFile = cur.image_file_path || null;
    if (typeof image_url !== 'undefined') {
      const v = String(image_url ?? '').trim();
      if (v) {
        if (/^https?:\/\//i.test(v)) {
          newImageUrl = v;
          newImageFile = null;
        } else {
          newImageUrl = null;
          newImageFile = v;
        }
      }
      // si v es vacío: conservar actuales
    }

    // Construir UPDATE dinámico para solo tocar campos provistos + imagen/updated_at
    const sets = [];
    const params = [];
    let p = 1;
    if (typeof name !== 'undefined') { sets.push(`name = $${p++}`); params.push(name); }
    if (typeof description !== 'undefined') { sets.push(`description = $${p++}`); params.push(description || null); }
    sets.push(`image_url = $${p++}`); params.push(newImageUrl);
    sets.push(`image_file_path = $${p++}`); params.push(newImageFile);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    params.push(idNum);

    const sql = `UPDATE Categories SET ${sets.join(', ')} WHERE id = $${p} RETURNING id`;
    const result = await query(sql, params);
    if (!result.rowCount) {
      return res.status(404).json({ error: 'Categoria no encontrada' });
    }
    res.json({ message: 'Categoría actualizada correctamente' });
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ error: 'El nombre de la categoria ya existe' });
    }
    console.error('Error al actualizar categoría:', err);
    res.status(500).json({ error: 'No se pudo actualizar la categoría' });
  }
}

// Eliminar categoría
async function deleteCategoria(req, res) {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: 'ID de la categoría requerido' });
  }

  try {
    const idNum = Number(id);
    if (!Number.isInteger(idNum) || idNum <= 0) {
      return res.status(400).json({ error: 'ID invalido' });
    }
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE Products
            SET deleted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE category_id = $1 AND deleted_at IS NULL`,
        [idNum]
      );
      const result = await client.query(
        `UPDATE Categories
            SET deleted_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
          WHERE id = $1 AND deleted_at IS NULL`,
        [idNum]
      );
      if (!result.rowCount) {
        const e = new Error('Categoria no encontrada');
        e.status = 404;
        throw e;
      }
    });
    res.json({ message: 'Categoría eliminada correctamente' });
  } catch (err) {
    console.error('Error al eliminar categoría:', err);
    res.status(500).json({ error: 'No se pudo eliminar la categoría' });
  }
}

// Ajustar precios de todos los productos de una categor��a por un porcentaje
async function adjustCategoryPrices(req, res) {
  const rawId = req.params.id;
  const rawPercent = req.body && (req.body.percent ?? req.body.porcentaje);

  const categoryId = Number(rawId);
  const percent = Number(rawPercent);

  if (!Number.isInteger(categoryId) || categoryId <= 0) {
    return res.status(400).json({ error: 'ID de la categor��a inv��lido' });
  }
  if (!Number.isFinite(percent)) {
    return res.status(400).json({ error: 'Porcentaje inv��lido' });
  }
  // Limitar rango para evitar errores humanos grandes
  if (percent < -90 || percent > 200) {
    return res.status(400).json({ error: 'Porcentaje fuera de rango permitido (-90 a 200)' });
  }

  try {
    const result = await withTransaction(async (client) => {
      // Asegurar que la categor��a exista y no est�� eliminada
      const { rows: cats } = await client.query(
        'SELECT id, name FROM Categories WHERE id = $1 AND deleted_at IS NULL',
        [categoryId]
      );
      if (!cats.length) {
        const e = new Error('Categoria no encontrada');
        e.statusCode = 404;
        throw e;
      }
      const categoryName = cats[0].name;

      const factor = 1 + (percent / 100);
      // Actualizar precios: multiplicar por factor, redondear a 2 decimales y evitar negativos
      const upd = await client.query(
        `UPDATE Products
            SET price = GREATEST(ROUND(price * $2::numeric, 2), 0),
                updated_at = CURRENT_TIMESTAMP
          WHERE category_id = $1
            AND deleted_at IS NULL`,
        [categoryId, factor]
      );

      return {
        affected: upd.rowCount || 0,
        categoryName,
      };
    });

    // Registrar en AuditLog (no bloquea la respuesta si falla)
    try {
      await audit(
        (req.user && req.user.email) || null,
        'CATEGORY_PRICE_ADJUST',
        'CATEGORY',
        categoryId,
        { percent, affected: result.affected, categoryName: result.categoryName }
      );
    } catch (_) {}

    return res.json({
      ok: true,
      categoryId,
      categoryName: result.categoryName,
      percent,
      affectedProducts: result.affected,
    });
  } catch (err) {
    if (err && err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message || 'Error ajustando precios' });
    }
    console.error('Error al ajustar precios por categor��a:', err);
    return res.status(500).json({ error: 'No se pudieron ajustar los precios de la categor��a' });
  }
}

module.exports = {
  getCategorias,
  createCategoria: [...validateCategory, createCategoria],
  updateCategoria: [...validateCategoryUpdate, updateCategoria],
  deleteCategoria,
  adjustCategoryPrices,
};


