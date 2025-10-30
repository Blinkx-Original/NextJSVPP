import { NextRequest, NextResponse } from 'next/server';
import {
  getPublishedCategoryBySlug,
  getPublishedProductsForCategory,
  type CategoryProductSummary,
  type CategorySummary
} from '@/lib/categories';
import { formatCategorySlugDisplay } from '@/lib/category-slug';
import { createRequestId } from '@/lib/request-id';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type ErrorCode = 'invalid_limit' | 'unexpected_error';

interface SerializedProductSummary {
  id: string;
  slug: string;
  title: string;
  shortSummary: string | null;
  price: string | null;
  primaryImage: string | null;
  lastUpdatedAt: string | null;
}

interface SuccessResponse {
  ok: true;
  category: { slug: string; name: string; type: 'product' | 'blog' };
  totalCount: number;
  products: SerializedProductSummary[];
}

interface ErrorResponse {
  ok: false;
  error_code: ErrorCode;
  message?: string;
}

function serializeProducts(products: CategoryProductSummary[]): SerializedProductSummary[] {
  return products.map((product) => ({
    id: product.id.toString(),
    slug: product.slug,
    title: product.title,
    shortSummary: product.shortSummary,
    price: product.price,
    primaryImage: product.primaryImage,
    lastUpdatedAt: product.lastUpdatedAt
  }));
}

function toFallbackCategory(slug: string): Pick<CategorySummary, 'id' | 'slug' | 'name' | 'type'> {
  return {
    id: BigInt(0),
    slug,
    name: formatCategorySlugDisplay(slug),
    type: 'product'
  };
}

function parseLimit(value: string | null): number {
  if (!value) {
    return 12;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error('invalid');
  }
  return Math.min(parsed, 24);
}

export async function GET(
  request: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse<SuccessResponse | ErrorResponse>> {
  const url = new URL(request.url);
  let limit = 12;

  try {
    limit = parseLimit(url.searchParams.get('limit'));
  } catch {
    return NextResponse.json(
      {
        ok: false,
        error_code: 'invalid_limit',
        message: 'The provided limit is not valid.'
      },
      { status: 400 }
    );
  }

  const requestId = createRequestId();
  const slug = params.slug.trim().toLowerCase();

  try {
    const category = await getPublishedCategoryBySlug(slug, { requestId });
    const resolvedCategory = category ?? toFallbackCategory(slug);

    const { products, totalCount } = resolvedCategory.type === 'product'
      ? await getPublishedProductsForCategory(resolvedCategory, { limit, offset: 0, requestId })
      : { products: [], totalCount: 0 };

    return NextResponse.json(
      {
        ok: true,
        category: {
          slug: resolvedCategory.slug,
          name: resolvedCategory.name,
          type: resolvedCategory.type
        },
        products: serializeProducts(products),
        totalCount
      },
      {
        headers: {
          'Cache-Control': 'no-store'
        }
      }
    );
  } catch (error) {
    console.error('[api.categories.products] failed to load products', error, { requestId, slug });
    return NextResponse.json(
      {
        ok: false,
        error_code: 'unexpected_error',
        message: 'Unable to load category products at this time.'
      },
      { status: 500 }
    );
  }
}
