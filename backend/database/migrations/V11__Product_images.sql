-- =====================================================
-- V11__Product_images.sql
-- Crea la tabla ProductImages para soportar múltiples imágenes por producto
-- =====================================================

CREATE TABLE IF NOT EXISTS ProductImages (
  id SERIAL PRIMARY KEY,
  product_id INT NOT NULL REFERENCES Products(id) ON DELETE CASCADE ON UPDATE CASCADE,
  url TEXT NOT NULL,
  sort_order INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_productimages_product_id ON ProductImages(product_id);
CREATE INDEX IF NOT EXISTS idx_productimages_sort_order ON ProductImages(product_id, sort_order);

