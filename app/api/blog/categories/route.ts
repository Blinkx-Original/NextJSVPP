import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { safeGetEnv } from '@/lib/env';
import { requireAdminAuth } from '@/lib/basic-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 120;
const SLUG_MAX_LENGTH = 80;

type ErrorCode = 'unauthorized' | 'missing_env' | 'sql_error' | 'invalid_payload' | 'duplicate_slug';

interface BlogCategoryItem {
  slug: string;
  name: string;
  is_published: boolean;
}

interface BlogCategoryResponse {
  ok: true;
  categories: BlogCategoryItem[];
}

interface BlogCategoryErrorResponse {
  ok: false;
  error_code: ErrorCode;
  message?: string;
  error_details?: unknown;
}

interface CreateCategoryPayload {
  name?: unknown;
  slug?: unknown;
  is_published?: unknown;
}

function buildErrorResponse(
  code: ErrorCode,
  init?: { status?: number; message?: string; details?: unknown }
): NextResponse<BlogCategoryErrorResponse> {
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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH);
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

function normalizePublished(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'false' || normalized === '0') {
      return false;
    }
    if (normalized === 'true' || normalized === '1') {
      return true;
    }
  }
  return true;
}

export async function GET(request: NextRequest): Promise<NextResponse<BlogCategoryResponse | BlogCategoryErrorResponse>> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return (auth.response as NextResponse<BlogCategoryErrorResponse>) ??
      buildErrorResponse('unauthorized', { status: 401 });
  }

  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  let limit = 50;
  if (limitParam) {
    const parsed = Number.parseInt(limitParam, 10);
    if (Number.isFinite(parsed) && parsed > 0 && parsed <= 100) {
      limit = parsed;
    }
  }

  const sql = `SELECT slug, name, is_published FROM categories WHERE type = 'blog' ORDER BY name ASC LIMIT ?`;
  try {
    const [rows] = await getPool().query<RowDataPacket[]>(sql, [limit]);
    const categories: BlogCategoryItem[] = Array.isArray(rows)
      ? rows
          .map((row) => ({
            slug: typeof row.slug === 'string' ? row.slug : '',
            name: typeof row.name === 'string' ? row.name : '',
            is_published: Boolean(row.is_published)
          }))
          .filter((item) => item.slug && item.name)
      : [];

    return NextResponse.json(
      {
        ok: true,
        categories
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const info = toDbErrorInfo(error);
    return buildErrorResponse('sql_error', { status: 500, message: info.message, details: info });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<BlogCategoryItem | BlogCategoryErrorResponse>> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return (auth.response as NextResponse<BlogCategoryErrorResponse>) ??
      buildErrorResponse('unauthorized', { status: 401 });
  }

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

  let name: string;
  let slug: string;
  let isPublished: boolean;

  try {
    name = normalizeName(payload.name);
    const fallbackSlug = slugify(name);
    slug = normalizeSlug(payload.slug ?? null, fallbackSlug);
    isPublished = normalizePublished(payload.is_published);
  } catch (error) {
    const field = (error as Error)?.message ?? 'invalid_payload';
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: `Invalid value for ${field}`
    });
  }

  const connection = await getPool().getConnection();
  try {
    const [existsRows] = await connection.query<RowDataPacket[]>(
      'SELECT id FROM categories WHERE type = ? AND slug = ? LIMIT 1',
      ['blog', slug]
    );
    if (Array.isArray(existsRows) && existsRows.length > 0) {
      return buildErrorResponse('duplicate_slug', {
        status: 409,
        message: 'Slug already exists for blog categories'
      });
    }

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO categories (type, slug, name, is_published, last_tidb_update_at)
       VALUES ('blog', ?, ?, ?, NOW(6))`,
      [slug, name, isPublished ? 1 : 0]
    );

    if (!result.insertId) {
      throw new Error('insert_failed');
    }

    return NextResponse.json(
      {
        slug,
        name,
        is_published: isPublished
      },
      { status: 201 }
    );
  } catch (error) {
    const info = toDbErrorInfo(error);
    if (info.code === 'ER_DUP_ENTRY' || info.code === '23505') {
      return buildErrorResponse('duplicate_slug', {
        status: 409,
        message: 'Slug already exists for blog categories',
        details: info
      });
    }
    return buildErrorResponse('sql_error', { status: 500, message: info.message, details: info });
  } finally {
    connection.release();
  }
}
