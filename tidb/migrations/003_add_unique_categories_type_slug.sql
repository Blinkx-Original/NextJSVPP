ALTER TABLE categories
  ADD CONSTRAINT uq_categories_type_slug UNIQUE (type, slug);

CREATE INDEX idx_products_category ON products(category);
