# 07 — Cloudflare Integration (MVP, domain-agnostic)

## Objetivo
Integrar **Cloudflare** al VPP Next.js para **purga de caché** (sitemaps y URLs recién publicadas), con credenciales **configurables desde admin** (no hardcoded), **Test Connection**, **Test Purge**, y acciones manuales.

## Storage de credenciales
- **Tabla `app_settings`** (grupo `cloudflare`): `zone_id`, `api_token`, `enable_purge_on_publish`, `include_product_urls`.
- `api_token` se enmascara en UI; no se loguea.  
- Opcional: permitir valores por defecto vía ENV (`CLOUDFLARE_ZONE_ID_DEFAULT`, `CLOUDFLARE_API_TOKEN_DEFAULT`) solo para pre‑poblar el formulario, **no obligatorios**.

## UI (Admin → Conectividad → Cloudflare)
Campos:
- **Zone ID** (`cf_zone_id`)
- **API Token** (`cf_api_token`, password enmascarado con "revelar")
- **Enable purge on publish/rebuild** (`enable_purge_on_publish`)
- **Include product URLs** (`include_product_urls`)

Botones:
- **Test Cloudflare Connection** — prueba `GET /zones/{zone_id}`
- **Test Cloudflare Purge (Sitemaps)** — purga `sitemap_index.xml` + hijos
- **Purge Sitemaps Now** — acción habitual
- **Purge Last Batch URLs** — purga URLs del último lote procesado
- **Purge Everything** — visible solo con modo Avanzado; requiere confirmación de texto

Estado:
- `connected` / `not configured`. Deshabilitar botones si faltan `zone_id` o `api_token`.

## Lógica de purga
**Construcción de URLs**
- `base = origin` de la petición admin (o `NEXT_PUBLIC_SITE_URL`) sin `/` final.
- Incluir siempre `base/sitemap_index.xml` + sitemaps hijos afectados por el lote o existentes.
- Si `include_product_urls`, añadir `base/p/{slug}` para cada publicado/actualizado.

**Invocación**
- Chunks de **≤ 2000 URLs** por llamada a `purge_cache`.
- Timeout objetivo: **20–30s**; **1 reintento** en 5xx o timeout.
- Éxito si todas devuelven `200` y `{"success": true}`.

**Registro**
- Guardar en log: fecha/hora, nº de URLs, duración, `zone_id`, y si está disponible `ray-id` devuelto por Cloudflare.
- No registrar `api_token` ni headers sensibles.

## Auto‑purge (hooks de orquestación)
- Tras **Publish to Sitemap** y **Rebuild** (fases internas del admin Next.js), invocar `onPublishCompleted(changedSitemaps, publishedSlugs)`:
  - Si `enable_purge_on_publish` = on → purgar sitemaps impactados.
  - Si además `include_product_urls` = on → purgar `p/{slug}` de `publishedSlugs`.

## Endpoints Cloudflare
- **Test Connection:** `GET /client/v4/zones/{zone_id}` con `Authorization: Bearer <token>`.
- **Purge Cache:** `POST /client/v4/zones/{zone_id}/purge_cache`
  - Por archivos: `{ "files": ["https://dominio/sitemap_index.xml", ...] }`
  - Avanzado: `{ "purge_everything": true }`

## Criterios específicos Cloudflare
- Sin credenciales → botones deshabilitados + aviso.
- Test Connection ✅/❌ según respuesta de proveedor.
- Purga sitemaps/último lote/auto‑purge implementadas con chunking, timeout, reintento y logs.
- **Domain‑agnostic**: ninguna URL hardcodeada; derivar del host actual o variable pública de sitio.
