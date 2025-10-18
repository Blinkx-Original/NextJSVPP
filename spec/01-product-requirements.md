# 01 — Requerimientos de Producto

## Meta
Replicar “Virtual Product Pages” en **Next.js** (Vercel): páginas virtuales en `/p/[slug]` renderizadas desde **TiDB**, sin carrito, con CTAs externas (Lead / Affiliate / Stripe / PayPal), búsqueda **Algolia**, y conectividad **Cloudflare** para purga de caché.

## No-Objetivos
- Sin WooCommerce ni inventario.
- Sin motor de precios/impuestos (lo maneja el destino del CTA).
- Sin variantes/matriz por ahora.

## Historias de Usuario
1. Como visitante, abro `/p/[slug]` y veo título/H1, brand, model, SKU, short summary, galería de imágenes y HTML largo.
2. Como visitante, veo **0–4 CTAs** según URLs presentes. El CTA primario está resaltado.
3. Como visitante, un producto no publicado da **404**.
4. Como motor de búsqueda, puedo leer `/sitemap.xml` (solo slugs publicados), shardeado a 50k.
5. Como motor de búsqueda, recibo `<title>`, metas OG, y **JSON‑LD Product**.
6. Como editor (fase 2), guardo en `/admin` y se escribe en TiDB, se upsertea en Algolia y se revalida la página/sitemap.
7. Como operador, puedo revalidar vía endpoint firmado.
8. **Cloudflare (fase 4 MVP):** Desde `/admin`, configuro credenciales CF, pruebo conexión, disparo purgas manuales (sitemaps / último lote / todo), y activo purga automática al publicar o rebuild.
