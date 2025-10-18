# 04 — UX Guidelines

- Estética **minimal tipo Vercel**, tipografía clara, gran espaciado y contraste accesible.
- **H1** = `title_h1`; `<title>` = `{title_h1} | {brand} {model}`.
- Galería usa `images_json` con fallbacks; soporta 0, 1 o N imágenes sin layout shift.
- **Short summary** arriba; **desc_html** abajo (HTML confiable).
- **CTAs**: mostrar solo si hay URL; el primario visualmente destacado.
- **Responsive** móvil→desktop; accesible por teclado/lectores.
- **Admin**: pestañas de **Datos (TiDB)**, **Búsqueda (Algolia)** y **Conectividad (Cloudflare)**.
- Estados de error: 404 amigable y error genérico.
