import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { requireAdminAuth } from '@/lib/basic-auth';
import { getPool } from '@/lib/db';
import { normalizeProductQuery } from '@/lib/product-search';

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

function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

const MAX_RESULTS = 20;

export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const { searchParams } = new URL(request.url);
  const normalized = normalizeProductQuery(searchParams.get('query'));

  if (!normalized) {
    return NextResponse.json<SearchSuccessResponse>({ ok: true, results: [] });
  }

  const pool = getPool();
  const seen = new Set<string>();
  const results: SearchSuccessResponse['results'] = [];

  const appendRows = (rows: RowDataPacket[]) => {
    for (const row of rows) {
      if (results.length >= MAX_RESULTS) {
        break;
      }

      const id = row.id != null ? row.id.toString() : '';
      const slug = typeof row.slug === 'string' ? row.slug : '';
      const key = `${id}:${slug}`;

      if (seen.has(key)) {
        continue;
      }

      seen.add(key);
      results.push({
        id,
        slug,
        title: typeof row.title_h1 === 'string' ? row.title_h1 : null
      });
    }
  };

  if (normalized.type === 'id') {
    const [byId] = await pool.query<RowDataPacket[]>(
      'SELECT id, slug, title_h1 FROM products WHERE id = ? LIMIT 1',
      [normalized.value]
    );
    appendRows(byId);

    if (results.length < MAX_RESULTS) {
      const likeTerm = `%${escapeLikeTerm(normalized.value)}%`;
      const [likeRows] = await pool.query<RowDataPacket[]>(
        "SELECT id, slug, title_h1 FROM products WHERE slug LIKE ? ESCAPE '\\' ORDER BY slug ASC LIMIT ?",
        [likeTerm, MAX_RESULTS]
      );
      appendRows(likeRows);
    }
  } else {
    const [exactRows] = await pool.query<RowDataPacket[]>(
      'SELECT id, slug, title_h1 FROM products WHERE slug = ? LIMIT 1',
      [normalized.value]
    );
    appendRows(exactRows);

    if (results.length < MAX_RESULTS) {
      const clauses: string[] = [];
      const params: Array<string | number> = [];

      const slugLike = `%${escapeLikeTerm(normalized.value)}%`;
      clauses.push("slug LIKE ? ESCAPE '\\'");
      params.push(slugLike);

      const titleTerm = normalized.searchTerm.trim();
      if (titleTerm) {
        const titleLike = `%${escapeLikeTerm(titleTerm)}%`;
        clauses.push("title_h1 LIKE ? ESCAPE '\\'");
        params.push(titleLike);
      }

      if (clauses.length > 0) {
        const sql = `SELECT id, slug, title_h1 FROM products WHERE ${clauses.join(
          ' OR '
        )} ORDER BY slug ASC LIMIT ?`;
        params.push(MAX_RESULTS);
        const [likeRows] = await pool.query<RowDataPacket[]>(sql, params);
        appendRows(likeRows);
      }
    }
  }

  return NextResponse.json<SearchSuccessResponse>({ ok: true, results });
}
