import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { requireAdminAuth } from '@/lib/basic-auth';
import { getPool } from '@/lib/db';

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

interface SearchErrorResponse {
  ok: false;
  error_code: 'invalid_query';
  message?: string;
}

function escapeLikeTerm(term: string): string {
  return term.replace(/[\\%_]/g, (char) => `\\${char}`);
}

export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query')?.trim();

  if (!query) {
    return NextResponse.json<SearchErrorResponse>(
      { ok: false, error_code: 'invalid_query', message: 'query requerido' },
      { status: 400 }
    );
  }

  const sanitized = escapeLikeTerm(query);
  const likeTerm = `%${sanitized}%`;
  const numericId = /^[0-9]+$/.test(query) ? query : null;

  const clauses = [
    "slug LIKE ? ESCAPE '\\'",
    "title_h1 LIKE ? ESCAPE '\\'"
  ];
  const params: Array<string | number> = [likeTerm, likeTerm];

  if (numericId) {
    clauses.push('id = ?');
    params.push(numericId);
  }

  const sql = `SELECT id, slug, title_h1 FROM products WHERE ${clauses.join(' OR ')} ORDER BY slug ASC LIMIT 10`;
  const [rows] = await getPool().query<RowDataPacket[]>(sql, params);

  const results = rows.map((row) => ({
    id: row.id != null ? row.id.toString() : '',
    slug: typeof row.slug === 'string' ? row.slug : '',
    title: typeof row.title_h1 === 'string' ? row.title_h1 : null
  }));

  return NextResponse.json<SearchSuccessResponse>({ ok: true, results });
}
