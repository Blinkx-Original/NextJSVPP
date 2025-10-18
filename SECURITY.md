# Seguridad & Secretos

- No comites secretos. Configura variables en **Vercel** o usa `/admin` para guardarlas en DB (ver `app_settings`).
- Usuario DB de lectura para SSR; escritura solo en server actions.
- `/admin` tras Basic Auth; rota credenciales.
- Endpoint `/api/revalidate` con secreto y rotación periódica.
- En Cloudflare, **no** loguees el token; registra `zone_id` y resultados.
