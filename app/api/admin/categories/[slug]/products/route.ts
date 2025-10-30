import { NextRequest, NextResponse } from 'next/server';
import { getPool, toDbErrorInfo } from '@/lib/db';
import {
  getPublishedProductsForCategory,
  type CategoryProductSummary
} from '@/lib/categories';
import { safeGetEnv } from '@/lib/env';
import { requireAdminAuth } from '@/lib/basic-auth';
import { ensureCategorySlug } from '@/lib/category-slug';
import { buildErrorResponse, normalizeType, type CategoryType } from '../../common';
import { fetchAdminCategoryBySlug } from '../../helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const DEFAULT_LIMIT = 24;
const MAX_LIMIT = 60;

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

interface CategoryProductsSuccessResponse {
  ok: true;
  products: CategoryProductSummary[];
  totalCount: number;
  limit: number;
  offset: number;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse<CategoryProductsSuccessResponse | { ok: false; error_code: string; message?: string }>> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response ?? buildErrorResponse('unauthorized', { status: 401 });
  }

  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const slugParam = params.slug ?? '';
  const slug = ensureCategorySlug(slugParam);
  if (!slug) {
    return buildErrorResponse('invalid_query', { status: 400, message: 'Missing category slug.' });
  }

  const url = new URL(request.url);
  const type: CategoryType = normalizeType(url.searchParams.get('type'));
  const limit = clampLimit(url.searchParams.get('limit'));
  const offset = clampOffset(url.searchParams.get('offset'));

  try {
    const pool = getPool();
    const category = await fetchAdminCategoryBySlug(pool, type, slug);
    if (!category) {
      return buildErrorResponse('not_found', { status: 404, message: 'Category not found.' });
    }

    const { products, totalCount } = await getPublishedProductsForCategory(
      { id: BigInt(category.id), slug: category.slug, name: category.name },
      { limit, offset }
    );

    return NextResponse.json(
      { ok: true, products, totalCount, limit, offset },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const info = toDbErrorInfo(error);
    return buildErrorResponse('sql_error', { status: 500, message: info.message, details: info });
  }
}
