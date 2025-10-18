# 06 — Rutas & APIs

## Rutas públicas
- `/p/[slug]` — SSR + ISR.
- `/sitemap.xml` — Dinámico con ISR.
- `/healthz` — Estado de servicio.

## Admin (server actions / APIs protegidas)
- `/admin` — Editor de productos (fase 2).
- `/admin/cloudflare` — Pantalla de conectividad Cloudflare:
  - Campos:
    - `cf_zone_id` (texto)
    - `cf_api_token` (password enmascarado)
    - `enable_purge_on_publish` (checkbox)
    - `include_product_urls` (checkbox)
  - Botones:
    - **Test Connection** → POST `/admin/cloudflare/test-connection`
    - **Test Purge (Sitemaps)** → POST `/admin/cloudflare/test-purge-sitemaps`
    - **Purge Sitemaps Now** → POST `/admin/cloudflare/purge-sitemaps`
    - **Purge Last Batch URLs** → POST `/admin/cloudflare/purge-last-batch`
    - **Purge Everything** (modo avanzado) → POST `/admin/cloudflare/purge-everything` (doble confirmación)

## Revalidate
- `POST /api/revalidate` con header `x-revalidate-secret: <REVALIDATE_SECRET>` y body opcional `{ "slug": "..." }`.
  - `{ "slug": "abc" }` → revalida `/p/abc`
  - `{}` → revalida `/sitemap.xml`

## Cloudflare — Endpoints remotos (proveedor)
- **GET** `https://api.cloudflare.com/client/v4/zones/{zone_id}` — Test Connection  
  Headers: `Authorization: Bearer <token>`, `Content-Type: application/json`
- **POST** `https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache` — Purge  
  Body por archivos: `{"files": ["https://dominio/sitemap_index.xml", "..."]}`  
  (Opción avanzada) `{"purge_everything": true}`
