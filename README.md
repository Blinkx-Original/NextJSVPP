# VPP para Next.js — Implementación (TiDB + Algolia + Cloudflare)

**Objetivo:** Replicar el modelo “Virtual Product Pages” (VPP) en **Next.js** sobre **Vercel**, con integración nativa a **TiDB** (datos), **Algolia** (búsqueda) y **Cloudflare** (conectividad, caché y purge).
Este repositorio contiene la implementación base (Fase 1) junto con **requerimientos, criterios de aceptación, fixtures y pruebas de paridad**.

- Fecha: 2025-10-18
- Owners: Martin (producto), y Equipo / Codex (implementación)

## Contenidos
- `/spec` — Requerimientos de producto, decisiones de arquitectura, contratos de datos, UX, criterios de aceptación, rutas/APIs y **Cloudflare**.
- `/fixtures` — Muestras de productos en JSON (casos comunes y bordes).
- `/parity-tests` — Salidas esperadas (secciones HTML, JSON-LD, sitemap).
- `/env/.env.example` — Variables de entorno (placeholders, **sin secretos**).
- `.github/ISSUE_TEMPLATE` — Plantilla para tareas por fase.
- `TASKS.md` — Checklist por fases y milestones.

## Guardarraíles
- No se comiten secretos. Configurar en **Vercel → Project Settings → Environment Variables** o en **/admin** según espec.
- **Next.js App Router** + **ISR** (on‑demand revalidate) como base.
- Fuente de verdad: **TiDB**; búsqueda: **Algolia**; conectividad/caché: **Cloudflare**; **no** hay carrito (CTAs externas).

## Quick start

1. Instalar dependencias: `npm install`.
2. Copiar `env/.env.example` a `.env.local` y completar credenciales TiDB, Algolia y secretos de admin.
3. Ejecutar el entorno local: `npm run dev`.
4. Visitar `/p/[slug]` para productos publicados o `/healthz` para el status de TiDB.

> La Fase 2 (panel de administración con escritura y Algolia) y posteriores se implementarán sobre esta base.

## Fases
1. **Fase 1 — Paridad read-only:** `/p/[slug]`, SEO, JSON‑LD, sitemap, fixtures OK.
2. **Fase 2 — Admin & Search:** Edición → TiDB write, Algolia upsert, revalidate.
3. **Fase 3 — Hardening:** Auth, logging, sitemap sharding.
4. **Fase 4 — Cloudflare (MVP):** UI de Cloudflare, prueba conexión, purga sitemaps/último lote, auto‑purge en publicar/rebuild.
5. **Fase 5 — Opcionales:** Import CSV, preview/drafts, flags.

> Nota: El **MVP Cloudflare** está especificado en `spec/07-cloudflare-integration.md` y criterios añadidos en `spec/05-acceptance-criteria.md`.
