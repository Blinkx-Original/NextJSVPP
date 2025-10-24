import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { requireAdminAuth } from '@/lib/basic-auth';
import { getPool } from '@/lib/db';
import { normalizeProductQuery } from '@/lib/product-query-normalizer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface SearchSuccessResponse {
  ok: true;
  results: Array<{
    id: string;
    slug: string;
    title: string | null;
  }>;
}

/**
 * API de búsqueda de productos para el panel de Assets.
 *
 * Acepta un parámetro `query` que puede ser slug, ID o URL. Devuelve una lista
 * de como máximo 20 productos que coincidan (exacto o parcial). Nunca lanza un
 * 400 por entradas vacías: en ese caso responde { ok: true, results: [] }.
 */
export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('query') ?? '';
  const norm = normalizeProductQuery(raw);

  // Si el input no produce un slug ni un ID, retornar lista vacía
  if (!norm) {
    return NextResponse.json<SearchSuccessResponse>({ ok: true, results: [] });
  }

  const pool = getPool();
  let rows: RowDataPacket[] = [];

  if (norm.type === 'id') {
    const [res] = await pool.query<RowDataPacket[]>(
      'SELECT id, slug, title_h1 FROM products WHERE id = ? LIMIT 1',
      [norm.value]
    );
    rows = Array.isArray(res) ? res : [];
  } else {
    const slug = norm.value;
    // Primero buscar coincidencia exacta por slug
    const [exact] = await pool.query<RowDataPacket[]>(
      'SELECT id, slug, title_h1 FROM products WHERE slug = ? LIMIT 1',
      [slug]
    );
    if (Array.isArray(exact) && exact.length > 0) {
      rows = exact;
    } else {
      // Fallback a búsqueda parcial en slug o title
      const sanitized = slug.replace(/[\\%_]/g, (char) => `\\${char}`);
      const likeTerm = `%${sanitized}%`;
      const [partial] = await pool.query<RowDataPacket[]>(
        "SELECT id, slug, title_h1 FROM products WHERE slug LIKE ? ESCAPE '\\\\' OR title_h1 LIKE ? ESCAPE '\\\\' ORDER BY slug ASC LIMIT 20",
        [likeTerm, likeTerm]
      );
      rows = Array.isArray(partial) ? partial : [];
    }
  }

  const results = rows.map((row) => ({
    id: row.id != null ? String(row.id) : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    title: typeof row.title_h1 === 'string' ? row.title_h1 : null
  }));

  return NextResponse.json<SearchSuccessResponse>({ ok: true, results });
}
