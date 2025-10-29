import { NextRequest, NextResponse } from 'next/server';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { revalidatePath } from 'next/cache';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { getCategoryTypeSynonyms } from '@/lib/categories';
import { safeGetEnv } from '@/lib/env';
import { requireAdminAuth } from '@/lib/basic-auth';
import { ensureCategorySlug } from '@/lib/category-slug';
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
} from '../common';
import {
  fetchAdminCategoryBySlug,
  getBlogCategoryColumn,
  type AdminCategoryRow,
  type BlogCategoryColumn
} from '../helpers';

interface UpdateCategoryPayload {
  type?: unknown;
  name?: unknown;
  short_description?: unknown;
  long_description?: unknown;
  hero_image_url?: unknown;
  is_published?: unknown;
}

type DeleteMode = 'block' | 'reassign' | 'detach';

function toIdString(value: unknown): string {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  return String(value);
}

function parseCategoryTypeInput(value: unknown): CategoryType | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  if (getCategoryTypeSynonyms('blog').includes(normalized)) {
    return 'blog';
  }
  if (getCategoryTypeSynonyms('product').includes(normalized)) {
    return 'product';
  }
  return null;
}

function parseDeleteMode(value: string | null): DeleteMode {
  if (!value) {
    return 'block';
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === 'reassign') {
    return 'reassign';
  }
  if (normalized === 'detach') {
    return 'detach';
  }
  return 'block';
}

async function countCategoryRelations(
  connection: PoolConnection,
  type: CategoryType,
  slug: string,
  blogColumnOverride?: BlogCategoryColumn | null
): Promise<number> {
  if (type === 'product') {
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
        FROM products
        WHERE category = ? AND is_published = 1`,
      [slug]
    );
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const value = row ? row.total : 0;
    const total = Number.isFinite(value) ? Number(value) : Number.parseInt(String(value ?? '0'), 10);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  const blogColumn =
    blogColumnOverride !== undefined
      ? blogColumnOverride
      : await getBlogCategoryColumn(connection);
  if (!blogColumn) {
    return 0;
  }

  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
      FROM posts
      WHERE \`${blogColumn}\` = ? AND is_published = 1`,
    [slug]
  );
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  const value = row ? row.total : 0;
  const total = Number.isFinite(value) ? Number(value) : Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<
  NextResponse<
    | { ok: true; category: AdminCategoryRow }
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

  const slugParam = params.slug ?? '';
  const slug = slugParam.trim().toLowerCase();
  if (!slug) {
    return buildErrorResponse('invalid_query', { status: 400, message: 'Missing slug parameter' });
  }

  const url = new URL(request.url);
  const queryType = normalizeType(url.searchParams.get('type'));

  try {
    const category = await fetchAdminCategoryBySlug(getPool(), queryType, slug);
    if (!category) {
      return buildErrorResponse('not_found', { status: 404, message: 'Category not found' });
    }
    return NextResponse.json({ ok: true, category }, { headers: { 'Cache-Control': 'no-store, max-age=0' } });
  } catch (error) {
    const info = toDbErrorInfo(error);
    return buildErrorResponse('sql_error', { status: 500, message: info.message, details: info });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<
  NextResponse<
    | { ok: true; category: AdminCategoryRow }
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

  let payload: UpdateCategoryPayload;
  try {
    payload = (await request.json()) as UpdateCategoryPayload;
  } catch (error) {
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: 'Invalid JSON payload',
      details: { message: (error as Error)?.message }
    });
  }

  const url = new URL(request.url);
  const queryType = normalizeType(url.searchParams.get('type'));
  const slug = ensureCategorySlug(params.slug);

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const typeSynonyms = getCategoryTypeSynonyms(queryType);
    const placeholders = typeSynonyms.map(() => '?').join(', ');
    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, type, name, short_description, long_description, hero_image_url, is_published
        FROM categories
        WHERE slug = ? AND LOWER(type) IN (${placeholders})
        LIMIT 1 FOR UPDATE`,
      [slug, ...typeSynonyms]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      await connection.rollback();
      return buildErrorResponse('not_found', { status: 404, message: 'Category not found' });
    }

    const record = rows[0] as RowDataPacket;
    const categoryId = toIdString(record.id);
    const currentName = typeof record.name === 'string' ? record.name : '';
    const currentShort = typeof record.short_description === 'string' ? record.short_description : null;
    const currentLong = typeof record.long_description === 'string' ? record.long_description : null;
    const currentHero = typeof record.hero_image_url === 'string' ? record.hero_image_url : null;
    const currentPublished = Boolean(record.is_published);
    const currentType =
      typeof record.type === 'string' ? parseCategoryTypeInput(record.type) ?? queryType : queryType;
    let nextType = currentType;
    let typeChanged = false;

    let name = currentName;
    let shortDescription = currentShort;
    let longDescription = currentLong;
    let heroImageUrl = currentHero;
    let isPublished = currentPublished;

    let nameChanged = false;
    let shortChanged = false;
    let longChanged = false;
    let heroChanged = false;
    let publishedChanged = false;

    if (Object.prototype.hasOwnProperty.call(payload, 'name')) {
      name = normalizeName(payload.name);
      nameChanged = name !== currentName;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'short_description')) {
      shortDescription = normalizeOptionalText(payload.short_description, SHORT_DESCRIPTION_MAX_LENGTH);
      shortChanged = shortDescription !== currentShort;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'long_description')) {
      longDescription = normalizeOptionalText(payload.long_description, LONG_DESCRIPTION_MAX_LENGTH);
      longChanged = longDescription !== currentLong;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'hero_image_url')) {
      heroImageUrl = normalizeOptionalText(payload.hero_image_url, HERO_IMAGE_MAX_LENGTH);
      heroChanged = heroImageUrl !== currentHero;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'is_published')) {
      const normalizedPublished = normalizeBoolean(payload.is_published, currentPublished);
      publishedChanged = normalizedPublished !== currentPublished;
      isPublished = normalizedPublished;
    }

    if (Object.prototype.hasOwnProperty.call(payload, 'type')) {
      const parsedType = parseCategoryTypeInput(payload.type);
      if (!parsedType) {
        await connection.rollback();
        return buildErrorResponse('invalid_payload', {
          status: 400,
          message: 'Invalid category type'
        });
      }
      typeChanged = parsedType !== currentType;
      nextType = parsedType;
    }

    if (!nameChanged && !shortChanged && !longChanged && !heroChanged && !publishedChanged && !typeChanged) {
      await connection.rollback();
      const existing = await fetchAdminCategoryBySlug(pool, currentType, slug);
      if (!existing) {
        return buildErrorResponse('not_found', { status: 404, message: 'Category not found' });
      }
      return NextResponse.json({ ok: true, category: existing });
    }

    const updates: string[] = [];
    const params: unknown[] = [];

    if (nameChanged) {
      updates.push('name = ?');
      params.push(name);
    }
    if (shortChanged) {
      updates.push('short_description = ?');
      params.push(shortDescription);
    }
    if (longChanged) {
      updates.push('long_description = ?');
      params.push(longDescription);
    }
    if (heroChanged) {
      updates.push('hero_image_url = ?');
      params.push(heroImageUrl);
    }
    if (publishedChanged) {
      updates.push('is_published = ?');
      params.push(isPublished ? 1 : 0);
    }
    if (typeChanged) {
      updates.push('type = ?');
      params.push(nextType);
    }

    updates.push('updated_at = NOW(6)');
    updates.push('last_tidb_update_at = NOW(6)');

    await connection.query<ResultSetHeader>(
      `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`,
      [...params, categoryId]
    );

    if (typeChanged) {
      if (currentType === 'product') {
        await connection.query(`UPDATE products SET category = NULL WHERE category = ?`, [slug]);
      }
      if (nextType === 'product') {
        const blogColumn = await getBlogCategoryColumn(connection);
        if (blogColumn) {
          await connection.query(`UPDATE posts SET \`${blogColumn}\` = NULL WHERE \`${blogColumn}\` = ?`, [slug]);
        }
      }
    }

    await connection.commit();

    const updated = await fetchAdminCategoryBySlug(pool, nextType, slug);
    if (!updated) {
      return buildErrorResponse('not_found', { status: 404, message: 'Category not found after update' });
    }

    revalidatePath('/categories');
    if (currentType === 'product' || nextType === 'product') {
      revalidatePath(`/c/${slug}`);
    }

    return NextResponse.json({ ok: true, category: updated });
  } catch (error) {
    await connection.rollback();
    const info = toDbErrorInfo(error);
    if ((info.code === 'ER_DUP_ENTRY' || info.code === '23505') && info.message) {
      return buildErrorResponse('duplicate_slug', {
        status: 409,
        message: 'Slug already exists for this category type',
        details: info
      });
    }
    return buildErrorResponse('sql_error', { status: 500, message: info.message, details: info });
  } finally {
    connection.release();
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<
  NextResponse<
    | { ok: true }
    | { ok: false; error_code: ErrorCode; message?: string; error_details?: unknown; products_count?: number }
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
  const slug = ensureCategorySlug(params.slug);
  const mode = parseDeleteMode(url.searchParams.get('mode'));
  const targetSlug = url.searchParams.get('to')?.trim().toLowerCase() ?? '';

  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const typeSynonyms = getCategoryTypeSynonyms(type);
    const placeholders = typeSynonyms.map(() => '?').join(', ');

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT id, name
        FROM categories
        WHERE slug = ? AND LOWER(type) IN (${placeholders})
        LIMIT 1 FOR UPDATE`,
      [slug, ...typeSynonyms]
    );

    if (!Array.isArray(rows) || rows.length === 0) {
      await connection.rollback();
      return buildErrorResponse('not_found', { status: 404, message: 'Category not found' });
    }

    const record = rows[0] as RowDataPacket;
    const categoryId = toIdString(record.id);
    const name = typeof record.name === 'string' ? record.name : '';

    const blogColumn = type === 'blog' ? await getBlogCategoryColumn(connection) : null;
    const relatedCount = await countCategoryRelations(connection, type, slug, blogColumn);

    if (mode === 'block' && relatedCount > 0) {
      await connection.rollback();
      return NextResponse.json(
        {
          ok: false,
          error_code: 'invalid_payload',
          message: 'Category still has related content',
          products_count: relatedCount
        },
        { status: 409 }
      );
    }

    if (mode === 'reassign') {
      if (!targetSlug || targetSlug === slug) {
        await connection.rollback();
        return buildErrorResponse('invalid_payload', {
          status: 400,
          message: 'Target category slug is required for reassignment'
        });
      }

      const target = await fetchAdminCategoryBySlug(pool, type, targetSlug);
      if (!target) {
        await connection.rollback();
        return buildErrorResponse('invalid_payload', {
          status: 400,
          message: 'Target category not found for reassignment'
        });
      }

      if (type === 'product') {
        await connection.query(`UPDATE products SET category = ? WHERE category = ?`, [target.slug, slug]);
      } else if (blogColumn) {
        await connection.query(`UPDATE posts SET \`${blogColumn}\` = ? WHERE \`${blogColumn}\` = ?`, [target.slug, slug]);
      }

      if (type === 'product') {
        revalidatePath(`/c/${target.slug}`);
      }
    } else if (mode === 'detach' && relatedCount > 0) {
      if (type === 'product') {
        await connection.query(`UPDATE products SET category = NULL WHERE category = ?`, [slug]);
      } else if (blogColumn) {
        await connection.query(`UPDATE posts SET \`${blogColumn}\` = NULL WHERE \`${blogColumn}\` = ?`, [slug]);
      }
    }

    await connection.query(`DELETE FROM categories WHERE id = ?`, [categoryId]);

    await connection.commit();

    revalidatePath('/categories');
    if (type === 'product') {
      revalidatePath(`/c/${slug}`);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    await connection.rollback();
    const info = toDbErrorInfo(error);
    return buildErrorResponse('sql_error', { status: 500, message: info.message, details: info });
  } finally {
    connection.release();
  }
}
