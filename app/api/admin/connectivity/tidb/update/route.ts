import { NextResponse } from 'next/server';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { safeGetEnv } from '@/lib/env';

export const runtime = 'nodejs';

type AllowedField = 'title_h1' | 'short_summary' | 'desc_html';

type TidbUpdateErrorCode =
  | 'missing_env'
  | 'invalid_payload'
  | 'missing_slug'
  | 'no_updates'
  | 'product_not_found'
  | 'sql_error';

interface TidbUpdateSuccessResponse {
  ok: true;
  rows_affected: number;
  product: {
    slug: string;
    title_h1: string | null;
    short_summary: string | null;
    desc_html: string | null;
    last_tidb_update_at: string | null;
  };
}

interface TidbUpdateErrorResponse {
  ok: false;
  error_code: TidbUpdateErrorCode;
  error_details?: unknown;
  message?: string;
}

type TidbUpdateResponse = TidbUpdateSuccessResponse | TidbUpdateErrorResponse;

interface UpdatePayload {
  slug?: unknown;
  title_h1?: unknown;
  short_summary?: unknown;
  desc_html?: unknown;
}

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function mapTidbError(error: unknown): TidbUpdateErrorResponse {
  const info = toDbErrorInfo(error);
  return {
    ok: false,
    error_code: 'sql_error',
    error_details: info
  };
}

async function ensureProductExists(connection: PoolConnection, slug: string): Promise<boolean> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT 1 FROM products WHERE slug = ? LIMIT 1',
    [slug]
  );
  return rows.length > 0;
}

async function fetchProduct(
  connection: PoolConnection,
  slug: string
): Promise<TidbUpdateSuccessResponse['product'] | null> {
  const [rows] = await connection.query<RowDataPacket[]>(
    'SELECT slug, title_h1, short_summary, desc_html, last_tidb_update_at FROM products WHERE slug = ? LIMIT 1',
    [slug]
  );

  if (rows.length === 0) {
    return null;
  }

  const row = rows[0] as RowDataPacket & {
    slug?: string;
    title_h1?: string | null;
    short_summary?: string | null;
    desc_html?: string | null;
    last_tidb_update_at?: Date | string | null;
  };

  return {
    slug: row.slug ?? slug,
    title_h1: row.title_h1 ?? null,
    short_summary: row.short_summary ?? null,
    desc_html: row.desc_html ?? null,
    last_tidb_update_at: toIsoString(row.last_tidb_update_at)
  };
}

export async function POST(request: Request): Promise<NextResponse<TidbUpdateResponse>> {
  if (!safeGetEnv()) {
    return NextResponse.json({ ok: false, error_code: 'missing_env' }, { status: 500 });
  }

  let payload: UpdatePayload;

  try {
    payload = (await request.json()) as UpdatePayload;
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error_code: 'invalid_payload',
        message: 'Invalid JSON payload',
        error_details: { message: (error as Error)?.message }
      },
      { status: 400 }
    );
  }

  const slug = typeof payload.slug === 'string' ? payload.slug.trim() : '';
  if (!slug) {
    return NextResponse.json(
      {
        ok: false,
        error_code: 'missing_slug',
        message: 'The slug field is required'
      },
      { status: 400 }
    );
  }

  const updates: { field: AllowedField; value: string }[] = [];
  const fields: AllowedField[] = ['title_h1', 'short_summary', 'desc_html'];
  const record = payload as Record<AllowedField, unknown>;

  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(record, field)) {
      const value = record[field];
      if (typeof value !== 'string') {
        return NextResponse.json(
          {
            ok: false,
            error_code: 'invalid_payload',
            message: `Field ${field} must be a string`
          },
          { status: 400 }
        );
      }
      updates.push({ field, value });
    }
  }

  if (updates.length === 0) {
    return NextResponse.json(
      {
        ok: false,
        error_code: 'no_updates',
        message: 'Provide at least one field to update'
      },
      { status: 400 }
    );
  }

  let connection: PoolConnection | null = null;

  try {
    connection = await getPool().getConnection();

    const exists = await ensureProductExists(connection, slug);
    if (!exists) {
      return NextResponse.json(
        {
          ok: false,
          error_code: 'product_not_found',
          message: 'Product not found'
        },
        { status: 404 }
      );
    }

    const setFragments = updates.map((update) => `${update.field} = ?`);
    const parameters = updates.map((update) => update.value);
    setFragments.push('last_tidb_update_at = NOW(6)');
    parameters.push(slug);

    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE products SET ${setFragments.join(', ')} WHERE slug = ?`,
      parameters
    );

    const product = await fetchProduct(connection, slug);
    if (!product) {
      return NextResponse.json(
        {
          ok: false,
          error_code: 'product_not_found',
          message: 'Product not found after update'
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      rows_affected: typeof result.affectedRows === 'number' ? result.affectedRows : 0,
      product
    });
  } catch (error) {
    const mapped = mapTidbError(error);
    return NextResponse.json(mapped, { status: 500 });
  } finally {
    connection?.release();
  }
}
