import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { safeGetEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface CategoryOption {
  slug: string;
  name: string;
  is_published: boolean;
}

interface CreateCategoryPayload {
  type?: unknown;
  name?: unknown;
  slug?: unknown;
  short_description?: unknown;
  long_description?: unknown;
  is_published?: unknown;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;
const SLUG_MAX_LENGTH = 80;
const SHORT_DESCRIPTION_MAX_LENGTH = 255;
const LONG_DESCRIPTION_MAX_LENGTH = 4000;

type CategoryType = 'product' | 'blog';

type ErrorCode =
  | 'missing_env'
  | 'invalid_query'
  | 'invalid_payload'
  | 'sql_error'
  | 'duplicate_slug';

function buildErrorResponse(
  code: ErrorCode,
  init?: { status?: number; message?: string; details?: unknown }
): NextResponse<{ ok: false; error_code: ErrorCode; message?: string; error_details?: unknown }> {
  return NextResponse.json(
    {
      ok: false,
      error_code: code,
      message: init?.message,
      error_details: init?.details
    },
    { status: init?.status ?? 400 }
  );
}

function normalizeType(input: string | null): CategoryType {
  if (input && input.toLowerCase() === 'blog') {
    return 'blog';
  }
  return 'product';
}

function sanitizeSearchTerm(value: string | null): string {
  if (!value) {
    return '';
  }
  return value.trim().slice(0, 120);
}

function clampLimit(value: string | null): number {
  if (!value) {
    return DEFAULT_LIMIT;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(parsed, MAX_LIMIT);
}

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'false' || trimmed === '0') {
      return false;
    }
    if (trimmed === 'true' || trimmed === '1') {
      return true;
    }
  }
  return fallback;
}

function normalizeOptionalText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function normalizeName(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('name');
  }
  const trimmed = value.trim();
  if (trimmed.length < NAME_MIN_LENGTH || trimmed.length > NAME_MAX_LENGTH) {
    throw new Error('name');
  }
  return trimmed;
}

function normalizeSlug(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    if (fallback) {
      return fallback;
    }
    throw new Error('slug');
  }
  const trimmed = value.trim().toLowerCase();
  if (!CATEGORY_SLUG_REGEX.test(trimmed) || trimmed.length > SLUG_MAX_LENGTH) {
    throw new Error('slug');
  }
  return trimmed;
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
}

export async function GET(request: NextRequest): Promise<NextResponse<CategoryOption[] | { ok: false; error_code: ErrorCode; message?: string; error_details?: unknown }>> {
  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const url = new URL(request.url);
  const type = normalizeType(url.searchParams.get('type'));
  const limit = clampLimit(url.searchParams.get('limit'));
  const term = sanitizeSearchTerm(url.searchParams.get('query'));

  const params: unknown[] = [type];
  let sql =
    'SELECT slug, name, is_published FROM categories WHERE type = ? AND is_published = 1';

  if (term) {
    params.push(`%${term}%`, `%${term}%`);
    sql += ' AND (name LIKE ? OR slug LIKE ?)';
  }

  sql += ' ORDER BY name ASC LIMIT ?';
  params.push(limit);

  try {
    const [rows] = await getPool().query<RowDataPacket[]>(sql, params);
    const categories: CategoryOption[] = Array.isArray(rows)
      ? rows
          .map((row) => ({
            slug: typeof row.slug === 'string' ? row.slug : '',
            name: typeof row.name === 'string' ? row.name : '',
            is_published: Boolean(row.is_published)
          }))
          .filter((item) => item.slug && item.name)
      : [];

    return NextResponse.json(categories, {
      headers: { 'Cache-Control': 'no-store, max-age=0' }
    });
  } catch (error) {
    const info = toDbErrorInfo(error);
    return buildErrorResponse('sql_error', {
      status: 500,
      message: info.message,
      details: info
    });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<CategoryOption | { ok: false; error_code: ErrorCode; message?: string; error_details?: unknown }>> {
  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  let payload: CreateCategoryPayload;
  try {
    payload = (await request.json()) as CreateCategoryPayload;
  } catch (error) {
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: 'Invalid JSON payload',
      details: { message: (error as Error)?.message }
    });
  }

  const type = normalizeType(typeof payload.type === 'string' ? payload.type : null);

  let name: string;
  let slug: string;
  let shortDescription: string | null;
  let longDescription: string | null;
  const isPublished = normalizeBoolean(payload.is_published, true);

  try {
    name = normalizeName(payload.name);
    const fallbackSlug = slugify(name);
    slug = normalizeSlug(payload.slug, fallbackSlug);
    shortDescription = normalizeOptionalText(payload.short_description, SHORT_DESCRIPTION_MAX_LENGTH);
    longDescription = normalizeOptionalText(payload.long_description, LONG_DESCRIPTION_MAX_LENGTH);
  } catch (error) {
    const field = (error as Error)?.message ?? 'invalid_payload';
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: `Invalid value for ${field}`
    });
  }

  const connection = await getPool().getConnection();
  try {
    const [dupeRows] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM categories WHERE type = ? AND slug = ? LIMIT 1',
      [type, slug]
    );

    if (Array.isArray(dupeRows) && dupeRows.length > 0) {
      return buildErrorResponse('duplicate_slug', {
        status: 409,
        message: 'Slug already exists for this category type'
      });
    }

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO categories (type, slug, name, short_description, long_description, is_published, last_tidb_update_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(6))`,
      [type, slug, name, shortDescription, longDescription, isPublished ? 1 : 0]
    );

    if (!result.insertId) {
      throw new Error('insert_failed');
    }

    const responseBody: CategoryOption = {
      slug,
      name,
      is_published: isPublished
    };

    revalidatePath('/categories');
    if (isPublished && type === 'product') {
      revalidatePath(`/c/${slug}`);
    }

    return NextResponse.json(responseBody, { status: 201 });
  } catch (error) {
    const info = toDbErrorInfo(error);
    if ((info.code === 'ER_DUP_ENTRY' || info.code === '23505') && info.message) {
      return buildErrorResponse('duplicate_slug', {
        status: 409,
        message: 'Slug already exists for this category type',
        details: info
      });
    }
    return buildErrorResponse('sql_error', {
      status: 500,
      message: info.message,
      details: info
    });
  } finally {
    connection.release();
  }
}
