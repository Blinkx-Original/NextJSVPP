import { NextRequest, NextResponse } from 'next/server';
import { safeGetEnv } from '@/lib/env';
import { requireAdminAuth } from '@/lib/basic-auth';
import {
  findBlogPostBySlug,
  normalizeBlogWritePayload,
  updateBlogPost,
  SEO_DESCRIPTION_MAX_LENGTH,
  SEO_TITLE_MAX_LENGTH,
  type BlogPostDetail
} from '@/lib/blog-posts';
import { categoryExistsByType } from '@/lib/categories';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type ErrorCode =
  | 'unauthorized'
  | 'missing_env'
  | 'post_not_found'
  | 'invalid_payload'
  | 'invalid_slug'
  | 'invalid_title'
  | 'invalid_category'
  | 'invalid_seo'
  | 'invalid_published_at'
  | 'slug_locked'
  | 'duplicate_slug'
  | 'sql_error'
  | 'method_not_allowed';

interface BlogPostResponse {
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

function mapNormalizationError(error: unknown) {
  const message = (error as Error)?.message;
  switch (message) {
    case 'invalid_slug':
      return { code: 'invalid_slug' as const, message: 'Slug must be kebab-case and <= 160 characters' };
    case 'invalid_title':
      return { code: 'invalid_title' as const, message: 'Title is required and must be <= 200 characters' };
    case 'invalid_category':
      return { code: 'invalid_category' as const, message: 'Invalid category slug' };
    case 'invalid_seo':
      return {
        code: 'invalid_seo' as const,
        message: `SEO title max ${SEO_TITLE_MAX_LENGTH} chars; SEO description max ${SEO_DESCRIPTION_MAX_LENGTH} chars`
      };
    case 'invalid_published_at':
      return { code: 'invalid_published_at' as const, message: 'Invalid published_at value' };
    default:
      return { code: 'invalid_payload' as const, message: 'Invalid payload' };
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse<BlogPostResponse | ErrorResponse>> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response ?? buildErrorResponse('unauthorized', { status: 401 });
  }

  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const slug = params.slug?.toLowerCase();
  if (!slug) {
    return buildErrorResponse('post_not_found', { status: 404, message: 'Post not found' });
  }

  const post = await findBlogPostBySlug(slug);
  if (!post) {
    return buildErrorResponse('post_not_found', { status: 404, message: 'Post not found' });
  }

  return NextResponse.json({ ok: true, post });
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse<BlogPostResponse | ErrorResponse>> {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response ?? buildErrorResponse('unauthorized', { status: 401 });
  }

  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const currentSlug = params.slug?.toLowerCase();
  if (!currentSlug) {
    return buildErrorResponse('post_not_found', { status: 404, message: 'Post not found' });
  }

  const existing = await findBlogPostBySlug(currentSlug);
  if (!existing) {
    return buildErrorResponse('post_not_found', { status: 404, message: 'Post not found' });
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

  if (payload.slug == null) {
    payload.slug = existing.slug;
  }

  let normalized;
  try {
    normalized = normalizeBlogWritePayload(payload);
  } catch (error) {
    const mapped = mapNormalizationError(error);
    return buildErrorResponse(mapped.code, { status: 400, message: mapped.message });
  }

  if (existing.isPublished && normalized.slug !== existing.slug) {
    return buildErrorResponse('slug_locked', {
      status: 400,
      message: 'Published posts cannot change slug'
    });
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

  const result = await updateBlogPost(existing.slug, normalized);
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
    return buildErrorResponse('sql_error', { status: 500, message: 'Unable to load updated post' });
  }

  return NextResponse.json({ ok: true, post: result.post });
}

export async function DELETE(): Promise<NextResponse<ErrorResponse>> {
  return buildErrorResponse('method_not_allowed', {
    status: 405,
    message: 'Deleting blog posts is not supported yet'
  });
}
