import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/basic-auth';
import { readCloudflareImagesConfig } from '@/lib/cloudflare-images';
import { getProductForImages, normalizeImages, parseImagesJson } from '@/lib/product-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface ResolveSuccessResponse {
  ok: true;
  product: {
    id: string;
    slug: string;
    title: string | null;
  };
  images: Array<{
    url: string;
    source: 'cloudflare' | 'external';
    image_id?: string | null;
    variant?: string | null;
    variant_url_public?: string | null;
  }>;
  images_json_format: 'strings' | 'objects';
}

interface ResolveErrorResponse {
  ok: false;
  error_code: 'invalid_query' | 'product_not_found';
  message?: string;
}

export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug')?.trim();
  const id = searchParams.get('id')?.trim();
  const slugOrId = slug || id;

  if (!slugOrId) {
    return NextResponse.json<ResolveErrorResponse>(
      { ok: false, error_code: 'invalid_query', message: 'slug o id requerido' },
      { status: 400 }
    );
  }

  const product = await getProductForImages({ slug, id });
  if (!product) {
    return NextResponse.json<ResolveErrorResponse>(
      { ok: false, error_code: 'product_not_found', message: 'Producto no encontrado' },
      { status: 404 }
    );
  }

  const config = readCloudflareImagesConfig();
  const parsed = parseImagesJson(product.imagesJson);
  const normalized = normalizeImages(parsed, config.baseUrl ?? undefined);

  return NextResponse.json<ResolveSuccessResponse>({
    ok: true,
    product: { id: product.id, slug: product.slug, title: product.title },
    images: normalized.map((entry) => ({
      url: entry.url,
      source: entry.source,
      image_id: entry.imageId ?? null,
      variant: entry.variant ?? null,
      variant_url_public: entry.variantUrlPublic ?? null
    })),
    images_json_format: parsed.format
  });
}
