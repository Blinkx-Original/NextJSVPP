ALTER TABLE categories
  MODIFY COLUMN type ENUM('product', 'blog') NOT NULL DEFAULT 'product',
  ADD UNIQUE KEY idx_categories_type_slug (type, slug);

UPDATE categories
SET type = 'product'
WHERE type IS NULL OR type = '';
