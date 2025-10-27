import { NextRequest, NextResponse } from 'next/server';
import { safeGetEnv } from '@/lib/env';
import { requireAdminAuth } from '@/lib/basic-auth';
import {
  queryBlogPosts,
  normalizeBlogWritePayload,
  insertBlogPost,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  type BlogPostSummary,
  type BlogPostDetail
} from '@/lib/blog-posts';
import { categoryExistsByType } from '@/lib/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type ErrorCode =
  | 'unauthorized'
  | 'missing_env'
  | 'invalid_query'
  | 'invalid_payload'
  | 'invalid_category'
  | 'invalid_seo'
  | 'invalid_slug'
  | 'invalid_title'
  | 'invalid_published_at'
  | 'duplicate_slug'
  | 'sql_error';

interface BlogPostsListResponse {
  ok: true;
  posts: BlogPostSummary[];
  next_cursor: number | null;
}

interface BlogPostCreateResponse {
  ok: true;
  post: BlogPostDetail;
}

interface ErrorResponse {
  ok: false;
  error_code: ErrorCode;
  message?: string;
  error_details?: unknown;
}

function buildErrorResponse(
  code: ErrorCode,
  init?: { status?: number; message?: string; details?: unknown }
): NextResponse<ErrorResponse> {
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

function parseCursor(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
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

function sanitizeQuery(value: string | null): string | undefined {
  if (!value) {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.slice(0, 160) : undefined;
}

export async function GET(request: NextRequest): Promise<NextResponse<BlogPostsListResponse | ErrorResponse>> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return (auth.response as NextResponse<ErrorResponse>) ??
      buildErrorResponse('unauthorized', { status: 401 });
  }

  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const url = new URL(request.url);
  const cursor = parseCursor(url.searchParams.get('cursor'));
  const limit = clampLimit(url.searchParams.get('limit'));
  const query = sanitizeQuery(url.searchParams.get('q'));

  const rawCategory = url.searchParams.get('cat');
  let category: string | undefined;
  if (rawCategory) {
    const normalizedCat = rawCategory.trim().toLowerCase();
    if (!normalizedCat || normalizedCat.length > 160 || !SLUG_REGEX.test(normalizedCat)) {
      return buildErrorResponse('invalid_query', {
        status: 400,
        message: 'Invalid category filter'
      });
    }
    category = normalizedCat;
  }

  if (url.searchParams.get('cursor') && cursor === undefined) {
    return buildErrorResponse('invalid_query', {
      status: 400,
      message: 'Invalid cursor value'
    });
  }

  const result = await queryBlogPosts({ cursor, limit, query, category });
  return NextResponse.json(
    {
      ok: true,
      posts: result.posts,
      next_cursor: result.nextCursor
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

function mapNormalizationError(error: unknown): { code: ErrorCode; message: string } {
  const message = (error as Error)?.message;
  switch (message) {
    case 'invalid_slug':
      return { code: 'invalid_slug', message: 'Slug must be kebab-case and <= 160 characters' };
    case 'invalid_title':
      return { code: 'invalid_title', message: 'Title is required and must be <= 200 characters' };
    case 'invalid_category':
      return { code: 'invalid_category', message: 'Invalid category slug' };
    case 'invalid_seo':
      return {
        code: 'invalid_seo',
        message: `SEO title max ${SEO_TITLE_MAX_LENGTH} chars; SEO description max ${SEO_DESCRIPTION_MAX_LENGTH} chars`
      };
    case 'invalid_published_at':
      return { code: 'invalid_published_at', message: 'Invalid published_at value' };
    default:
      return { code: 'invalid_payload', message: 'Invalid payload' };
  }
}

export async function POST(request: NextRequest): Promise<NextResponse<BlogPostCreateResponse | ErrorResponse>> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return (auth.response as NextResponse<ErrorResponse>) ??
      buildErrorResponse('unauthorized', { status: 401 });
  }

  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch (error) {
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: 'Invalid JSON payload',
      details: { message: (error as Error)?.message }
    });
  }

  let normalized;
  try {
    normalized = normalizeBlogWritePayload(payload);
  } catch (error) {
    const mapped = mapNormalizationError(error);
    return buildErrorResponse(mapped.code, { status: 400, message: mapped.message });
  }

  if (normalized.categorySlug) {
    const exists = await categoryExistsByType('blog', normalized.categorySlug);
    if (!exists) {
      return buildErrorResponse('invalid_category', {
        status: 400,
        message: 'category_slug does not exist for blog categories'
      });
    }
  }

  const result = await insertBlogPost(normalized);
  if (!result.ok) {
    if (result.error?.code === 'duplicate_slug') {
      return buildErrorResponse('duplicate_slug', {
        status: 409,
        message: 'Slug already exists',
        details: result.error.info
      });
    }
    return buildErrorResponse('sql_error', {
      status: 500,
      message: result.error?.message ?? 'Unexpected database error',
      details: result.error?.info
    });
  }

  if (!result.post) {
    return buildErrorResponse('sql_error', { status: 500, message: 'Unable to load created post' });
  }

  return NextResponse.json(
    {
      ok: true,
      post: result.post
    },
    { status: 201 }
  );
}
