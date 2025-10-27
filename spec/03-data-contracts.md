# 03 — Contratos de Datos

## Tabla principal: `products`
```
id BIGINT PRIMARY KEY,
slug VARCHAR UNIQUE NOT NULL,
title_h1 TEXT NOT NULL,
brand TEXT,
model TEXT,
sku TEXT,
short_summary TEXT,
images_json JSON,            -- array de URLs absolutas
desc_html LONGTEXT,          -- HTML (confiable)
cta_lead_url TEXT,
cta_stripe_url TEXT,
cta_affiliate_url TEXT,
cta_paypal_url TEXT,
is_published BOOLEAN DEFAULT FALSE,
last_tidb_update_at DATETIME
```

## Tabla de configuración: `app_settings`
Clave-valor para configuraciones de la app (Cloudflare, toggles, etc.).
```
id BIGINT PRIMARY KEY,
group_name VARCHAR NOT NULL,     -- p.ej., 'cloudflare'
key_name VARCHAR NOT NULL,       -- 'zone_id', 'api_token', 'enable_purge_on_publish', 'include_product_urls'
value_text TEXT NOT NULL,        -- valor; si es secreto, almacenar encriptado según política futura
updated_at DATETIME
UNIQUE(group_name, key_name)
```

> Alternativa: una sola fila JSON por grupo. Este contrato mantiene simplicidad de lectura/escritura.

## Tabla de publicaciones: `posts`
```
id BIGINT PRIMARY KEY,
slug VARCHAR UNIQUE NOT NULL,
title_h1 TEXT NOT NULL,
short_summary VARCHAR(160),
content_html LONGTEXT,
cover_image_url TEXT,
category_slug VARCHAR,
product_slugs_json JSON,
cta_lead_url TEXT,
cta_affiliate_url TEXT,
seo_title VARCHAR(60),
seo_description VARCHAR(160),
canonical_url TEXT,
is_published TINYINT(1) DEFAULT 0,
published_at DATETIME,
last_tidb_update_at TIMESTAMP
```

## Tabla de categorías: `categories`
- `type` → `ENUM('product','blog')` con `DEFAULT 'product'`.
- Índice compuesto `UNIQUE(type, slug)` para evitar colisiones entre productos y blog.

### Read Contract
- Productos por `slug`; 404 si no existe o no publicado.
- `images_json` parseable; tolerar vacío/incorrecto.

### Write Contract (fase 2)
- Guardado de producto actualiza `last_tidb_update_at`, hace **Algolia upsert** y **revalidate**.
- Configuraciones Cloudflare se guardan en `app_settings` y se enmascaran en UI.
- Posts utilizan `is_published` + `published_at` para definir visibilidad pública.
