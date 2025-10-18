# Tasks & Milestones

## Fase 1 — Paridad read-only
- [ ] `/p/[slug]` (SSR + ISR) desde TiDB (usuario read-only).
- [ ] JSON-LD + SEO + sitemap.
- [ ] `/healthz` OK.
- [ ] Fixtures cumplen criterios 1–7.

## Fase 2 — Admin & Search
- [ ] `/admin` con edición de `products`.
- [ ] Guardado → TiDB write + Algolia upsert + revalidate slug/sitemap.
- [ ] Basic Auth + logs mínimos.

## Fase 3 — Hardening
- [ ] Sharding sitemap (50k por archivo) + sitemap index.
- [ ] Validaciones, rate limit, sanitización.
- [ ] Logs estructurados y errores.

## Fase 4 — Cloudflare (MVP)
- [ ] Pantalla `/admin/cloudflare` con Zone ID, API Token, toggles y botones.
- [ ] Server actions para: Test Connection, Test Purge (Sitemaps), Purge Sitemaps Now, Purge Last Batch, Purge Everything (doble confirmación).
- [ ] Lógica de **chunking ≤ 2000**, timeout 20–30s y 1 reintento.
- [ ] Auto‑purge al finalizar publish/rebuild si toggle activo.
- [ ] Logs con nº URLs, duración y `ray-id`.
