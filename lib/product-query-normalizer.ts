export type ProductQuery =
  | { type: 'id'; value: string }
  | { type: 'slug'; value: string };

/**
 * Normaliza el input del usuario para convertirlo en un slug o ID numérico.
 *
 * - Acepta un slug, un ID numérico o una URL completa (p. ej. https://ejemplo.com/p/slug).
 * - Elimina fragmentos y parámetros de consulta.
 * - Decodifica caracteres escapados.
 * - Pasa todo a minúsculas y convierte espacios en guiones.
 * - Devuelve `{ type: 'slug', value }` o `{ type: 'id', value }`.
 * - Devuelve `null` si no puede extraer nada útil.
 */
export function normalizeProductQuery(
  input: string | null | undefined
): ProductQuery | null {
  if (!input) {
    return null;
  }
  let working = input.trim();

  // Si viene como URL completa, extraer el slug del path /p/<slug>
  try {
    if (/^https?:\/\//i.test(working)) {
      const parsed = new URL(working);
      const m = parsed.pathname.match(/\/p\/([^/]+)/);
      if (m && m[1]) {
        working = decodeURIComponent(m[1]);
      }
    }
  } catch {
    // ignorar errores de parseo y continuar con la cadena original
  }

  // Si es numérico puro, tratar como ID
  if (/^[0-9]+$/.test(working)) {
    return { type: 'id', value: working };
  }

  // Normalizar slug: a minúsculas, recortar y cambiar espacios por guiones
  const slug = working
    .toLowerCase()
    .trim()
    .replace(/[\s]+/g, '-');

  if (!slug) {
    return null;
  }
  return { type: 'slug', value: slug };
}
