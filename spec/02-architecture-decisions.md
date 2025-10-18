# 02 — Decisiones de Arquitectura (ADR)

## Framework
- **Next.js App Router** en **Vercel**.
- **ISR** para `/p/[slug]` y `/sitemap.xml` con revalidación bajo demanda.

## Datos
- **TiDB** (MySQL) es la fuente. Usuario **read-only** para SSR y **write** para admin.
- Acceso mediante ORM/driver (p.ej., Prisma). TLS opcional según entorno; **no** se requiere `TIDB_SSL_CA_PEM`.

## Búsqueda
- **Algolia**. Upsert en guardado desde servidor (sin secretos en cliente).

## Cloudflare
- Objetivo MVP: **purga de caché** de sitemaps y URLs recién publicadas/actualizadas, **sin reglas Cloudflare** personalizadas.
- Credenciales configurables desde `/admin` (no hardcoded). Botón **Test Connection** y **Test Purge (Sitemaps)**.
- Botones manuales: **Purge Sitemaps Now**, **Purge Last Batch URLs**, y opción avanzada **Purge Everything** con doble confirmación.
- Lógica de purga con **chunking ≤ 2000 URLs**, timeout ~30s y **1 reintento** si 5xx/timeout.
- Base de URLs **domain‑agnostic** a partir del **origen de la solicitud** o `NEXT_PUBLIC_SITE_URL` como fallback.

## Seguridad
- Ningún secreto en bundles de cliente. Todas las escrituras y purgas se hacen en **server actions** o rutas API protegidas.
- `/admin` con Basic Auth inicialmente; evolucionable a SSO.
- Revalidate endpoint con secreto compartido en env.
- Logs sin exponer tokens; registrar `zone_id`, cantidad de URLs y `ray-id` si existe.

## Observabilidad
- Medir latencia DB, estado de caché (HIT/MISS) e intentos de purga e ISR.
- `/healthz` con `{ ok, db, version }`.
