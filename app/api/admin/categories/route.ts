import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { getCategoryTypeSynonyms } from '@/lib/categories';
import { safeGetEnv } from '@/lib/env';
import { requireAdminAuth } from '@/lib/basic-auth';
import { CATEGORY_SLUG_MAX_LENGTH, coerceCategorySlug, slugifyCategoryName } from '@/lib/category-slug';
import {
  buildStatsClause,
  fetchAdminCategoryById,
  mapAdminCategoryRow,
  type AdminCategoryRow
} from './helpers';
import {
  HERO_IMAGE_MAX_LENGTH,
  LONG_DESCRIPTION_MAX_LENGTH,
  SHORT_DESCRIPTION_MAX_LENGTH,
  buildErrorResponse,
  normalizeBoolean,
  normalizeName,
  normalizeOptionalText,
  normalizeType,
  type CategoryType,
  type ErrorCode
} from './common';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface CategoryOption {
  slug: string;
  name: string;
  is_published: boolean;
}

type AdminCategoryItem = AdminCategoryRow;

interface CreateCategoryPayload {
  type?: unknown;
  name?: unknown;
  slug?: unknown;
  short_description?: unknown;
  long_description?: unknown;
  hero_image_url?: unknown;
  is_published?: unknown;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

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

function clampOffset(value: string | null): number {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}


export async function GET(
  request: NextRequest
): Promise<
  NextResponse<
    | {
        ok: true;
        categories: AdminCategoryItem[];
        items: CategoryOption[];
        totalCount: number;
        limit: number;
        offset: number;
      }
    | { ok: false; error_code: ErrorCode; message?: string; error_details?: unknown }
  >
> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response ?? buildErrorResponse('unauthorized', { status: 401 });
  }

  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const url = new URL(request.url);
  const type = normalizeType(url.searchParams.get('type'));
  const limit = clampLimit(url.searchParams.get('limit'));
  const offset = clampOffset(url.searchParams.get('offset'));
  const term = sanitizeSearchTerm(url.searchParams.get('q') ?? url.searchParams.get('query'));

  const pool = getPool();
  const typeSynonyms = getCategoryTypeSynonyms(type);
  const placeholders = typeSynonyms.map(() => '?').join(', ');
  const where: string[] = [`LOWER(c.type) IN (${placeholders})`];
  const params: unknown[] = [...typeSynonyms];

  if (term) {
    params.push(`%${term}%`, `%${term}%`);
    where.push('(c.name LIKE ? OR c.slug LIKE ?)');
  }

  const { joinSql, selectCount } = buildStatsClause(type);

  const listSql = `SELECT c.id, c.type, c.slug, c.name, c.short_description, c.long_description,
      c.hero_image_url, c.is_published, c.updated_at, ${selectCount}
    FROM categories c
    ${joinSql}
    WHERE ${where.join(' AND ')}
    ORDER BY c.updated_at DESC, c.name ASC
    LIMIT ? OFFSET ?`;

  const countSql = `SELECT COUNT(*) AS total FROM categories c WHERE ${where.join(' AND ')}`;

  try {
    const [rows] = await pool.query<RowDataPacket[]>(listSql, [...params, limit, offset]);
    const [countRows] = await pool.query<RowDataPacket[]>(countSql, params);
    const totalRaw = Array.isArray(countRows) && countRows.length > 0 ? countRows[0]?.total : 0;
    const totalCount = Number.isFinite(totalRaw) ? Number(totalRaw) : Number.parseInt(String(totalRaw ?? '0'), 10);
    const categories = Array.isArray(rows)
      ? rows.map((row) => mapAdminCategoryRow(row as RowDataPacket, type)).filter((item) => item.slug && item.name)
      : [];

    const options: CategoryOption[] = categories.map((category) => ({
      slug: category.slug,
      name: category.name,
      is_published: category.is_published
    }));

    return NextResponse.json(
      {
        ok: true,
        categories,
        items: options,
        totalCount: Number.isFinite(totalCount) ? Number(totalCount) : 0,
        limit,
        offset
      },
      {
        headers: { 'Cache-Control': 'no-store, max-age=0' }
      }
    );
  } catch (error) {
    const info = toDbErrorInfo(error);
    return buildErrorResponse('sql_error', {
      status: 500,
      message: info.message,
      details: info
    });
  }
}

export async function POST(
  request: NextRequest
): Promise<
  NextResponse<
    | {
        ok: true;
        category: AdminCategoryItem;
      }
    | { ok: false; error_code: ErrorCode; message?: string; error_details?: unknown }
  >
> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response ?? buildErrorResponse('unauthorized', { status: 401 });
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

  const type = normalizeType(typeof payload.type === 'string' ? payload.type : null);

  let name: string;
  let slug: string;
  let shortDescription: string | null;
  let longDescription: string | null;
  let heroImageUrl: string | null;
  const isPublished = normalizeBoolean(payload.is_published, true);

  try {
    name = normalizeName(payload.name);
    const fallbackSlug = slugifyCategoryName(name);
    slug = coerceCategorySlug(payload.slug, fallbackSlug);
    if (slug.length > CATEGORY_SLUG_MAX_LENGTH) {
      throw new Error('slug');
    }
    shortDescription = normalizeOptionalText(payload.short_description, SHORT_DESCRIPTION_MAX_LENGTH);
    longDescription = normalizeOptionalText(payload.long_description, LONG_DESCRIPTION_MAX_LENGTH);
    heroImageUrl = normalizeOptionalText(payload.hero_image_url, HERO_IMAGE_MAX_LENGTH);
  } catch (error) {
    const field = (error as Error)?.message ?? 'invalid_payload';
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: `Invalid value for ${field}`
    });
  }

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    const typeSynonyms = getCategoryTypeSynonyms(type);
    const placeholders = typeSynonyms.map(() => '?').join(', ');
    const [dupeRows] = await connection.query<RowDataPacket[]>(
      `SELECT id FROM categories WHERE slug = ? AND LOWER(type) IN (${placeholders}) LIMIT 1`,
      [slug, ...typeSynonyms]
    );

    if (Array.isArray(dupeRows) && dupeRows.length > 0) {
      return buildErrorResponse('duplicate_slug', {
        status: 409,
        message: 'Slug already exists for this category type'
      });
    }

    const [result] = await connection.query<ResultSetHeader>(
      `INSERT INTO categories (type, slug, name, short_description, long_description, hero_image_url, is_published, last_tidb_update_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(6))`,
      [type, slug, name, shortDescription, longDescription, heroImageUrl, isPublished ? 1 : 0]
    );

    if (!result.insertId) {
      throw new Error('insert_failed');
    }

    const created = await fetchAdminCategoryById(pool, type, Number(result.insertId));
    if (!created) {
      throw new Error('load_failed');
    }

    revalidatePath('/categories');
    if (isPublished && type === 'product') {
      revalidatePath(`/c/${slug}`);
    }

    return NextResponse.json({ ok: true, category: created }, { status: 201 });
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
