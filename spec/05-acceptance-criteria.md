# 05 — Criterios de Aceptación

### Render & SEO
1. **Paridad de render** — Con `full-product.json`, `/p/full-product` muestra H1, meta `<title>`, resumen, galería y `desc_html`.
2. **CTAs** — Aparecen **solo** si tienen URL; prioridad de primario: Lead → Affiliate → Stripe → PayPal.
3. **Unpublished** — `is_published = 0` devuelve **404**.
4. **Imágenes edge** — Sin imágenes, hay placeholder sin layout shift.
5. **JSON‑LD Product** — Incluye `name`, `brand`, `model`, `sku`, `image[]` y `url` al CTA primario si existe.
6. **Sitemap** — `/sitemap.xml` lista solo slugs publicados; shard a 50k (fase 3 puede simular).
7. **SEO** — Meta description con `short_summary` (~160 chars); OG image = primera imagen.

### Admin, Revalidate & Logs
8. **Revalidate** — Guardar en admin o POST firmado a `/api/revalidate` revalida `/p/[slug]` y `/sitemap.xml`; loguea éxito/fallo.
9. **Seguridad** — Sin secretos en cliente; `/admin` tras Basic Auth; validar inputs.
10. **Perf** — TTFB < 500ms en HIT (cuando ISR aplica).
11. **Health** — `/healthz` retorna `{ ok: true, db: "up", version: "<sha>" }`.

### Cloudflare (MVP)
12. **Sin credenciales** — Botones Cloudflare deshabilitados con aviso “Configure Zone ID + API Token”.
13. **Test Connection** — `GET /zones/{zone_id}` con token válido retorna ✅; inválido da ❌ con mensaje del proveedor.
14. **Purge Sitemaps Now** — Purga `sitemap_index.xml` + hijos existentes y retorna log con nº URLs, duración y `success:true`.
15. **Purge Last Batch URLs** — Si existe lote previo, purga sus `/p/{slug}` además de sitemaps cuando corresponda.
16. **Auto‑purge al publicar/rebuild** — Si `enable_purge_on_publish` = on: al finalizar publish/rebuild, purga sitemaps y, si `include_product_urls` = on, las URLs del lote.
17. **Chunking** — En purgas grandes, segmentación en bloques **≤ 2000 URLs**; 1 reintento en 5xx/timeout; timeout 20–30s.
18. **Dominio agnóstico** — URLs se construyen a partir del origen de la petición o `NEXT_PUBLIC_SITE_URL`; no hay dominios hardcodeados.
19. **Token seguro** — `api_token` no aparece en HTML; valor enmascarado; logs no imprimen secretos; se registra `zone_id` y `ray-id` si existe.
