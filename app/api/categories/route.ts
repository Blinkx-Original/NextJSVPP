import { NextRequest, NextResponse } from 'next/server';
import { getPublishedCategoryPickerOptions } from '@/lib/categories';
import { safeGetEnv } from '@/lib/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type PublicCategoryType = 'product' | 'blog';

type ErrorCode = 'missing_env' | 'invalid_query' | 'sql_error';

interface PublicCategoryItem {
  slug: string;
  name: string;
}

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

function normalizeType(value: string | null): PublicCategoryType {
  const normalized = value ? value.trim().toLowerCase() : '';
  if (normalized === 'blog' || normalized === 'blogs' || normalized === 'blog_category') {
    return 'blog';
  }
  return 'product';
}

function sanitizeSearchTerm(value: string | null): string {
  if (!value) {
    return '';
  }
  return value.trim().toLowerCase();
}

export async function GET(
  request: NextRequest
): Promise<
  NextResponse<
    | { ok: true; categories: PublicCategoryItem[] }
    | { ok: false; error_code: ErrorCode; message?: string; error_details?: unknown }
  >
> {
  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const url = new URL(request.url);
  const type = normalizeType(url.searchParams.get('type'));
  const search = sanitizeSearchTerm(url.searchParams.get('q'));
  const isPublished = url.searchParams.get('is_published');
  if (isPublished && isPublished !== '1' && isPublished.toLowerCase() !== 'true') {
    return buildErrorResponse('invalid_query', {
      status: 400,
      message: 'Only published categories are supported'
    });
  }

  try {
    const options = await getPublishedCategoryPickerOptions({ type });
    const filtered = search
      ? options.filter((option) =>
          option.name.toLowerCase().includes(search) || option.slug.toLowerCase().includes(search)
        )
      : options;

    const categories: PublicCategoryItem[] = filtered
      .map((option) => ({ slug: option.slug, name: option.name }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json(
      { ok: true, categories },
      { headers: { 'Cache-Control': 'max-age=60, s-maxage=60' } }
    );
  } catch (error) {
    return buildErrorResponse('sql_error', {
      status: 500,
      message: (error as Error)?.message,
      details: error
    });
  }
}
