import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader } from 'mysql2/promise';
import { revalidatePath } from 'next/cache';
import { requireAdminAuth } from '@/lib/basic-auth';
import { getPool } from '@/lib/db';
import { getCloudflareCredentials, purgeFiles, readCloudflareEnv } from '@/lib/cloudflare';
import { moveImageEntryToFront, normalizeImages, parseImagesJson, toImagesJsonString } from '@/lib/product-images';
import { ensureSiteUrl } from '@/lib/site-url';
import { clearProductCache } from '@/lib/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface MakePrimaryPayload {
  slugOrId?: unknown;
  slug?: unknown;
  id?: unknown;
  urlOrImageId?: unknown;
}

interface MakePrimarySuccessResponse {
  ok: true;
  product: {
    id: string;
    slug: string;
  };
  moved_from_index: number;
  images: Array<{
    url: string;
    source: 'cloudflare' | 'external';
    image_id?: string | null;
    variant?: string | null;
    variant_url_public?: string | null;
  }>;
  duration_ms: number;
  revalidated: boolean;
  purge?: {
    attempted: boolean;
    ok: boolean;
    latency_ms?: number;
    ray_ids?: string[];
    status?: number | null;
  };
}

interface MakePrimaryErrorResponse {
  ok: false;
  error_code: 'invalid_payload' | 'product_not_found' | 'image_not_found' | 'database_error';
  message?: string;
}

function resolveSlugOrId(payload: MakePrimaryPayload): string | null {
  const candidates = [payload.slugOrId, payload.slug, payload.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveTarget(payload: MakePrimaryPayload): string | null {
  const value = payload.urlOrImageId;
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  return null;
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  let payload: MakePrimaryPayload;
  try {
    payload = (await request.json()) as MakePrimaryPayload;
  } catch (error) {
    return NextResponse.json<MakePrimaryErrorResponse>(
      { ok: false, error_code: 'invalid_payload', message: 'JSON inválido' },
      { status: 400 }
    );
  }

  const slugOrId = resolveSlugOrId(payload);
  const target = resolveTarget(payload);

  if (!slugOrId || !target) {
    return NextResponse.json<MakePrimaryErrorResponse>(
      { ok: false, error_code: 'invalid_payload', message: 'slugOrId y urlOrImageId son requeridos' },
      { status: 400 }
    );
  }

  const product = await getProductForImages({ slug: slugOrId, id: slugOrId });
  if (!product) {
    return NextResponse.json<MakePrimaryErrorResponse>(
      { ok: false, error_code: 'product_not_found', message: 'Producto no encontrado' },
      { status: 404 }
    );
  }

  const parsed = parseImagesJson(product.imagesJson);
  const baseUrl = process.env.CF_IMAGES_BASE_URL ?? undefined;
  const normalized = normalizeImages(parsed, baseUrl);

  const match = normalized.find(
    (entry) => entry.url === target || (entry.imageId && entry.imageId === target)
  );

  if (!match) {
    return NextResponse.json<MakePrimaryErrorResponse>(
      { ok: false, error_code: 'image_not_found', message: 'Imagen no encontrada en el producto' },
      { status: 404 }
    );
  }

  const startedAt = Date.now();

  let updated = parsed;
  if (match.rawIndex > 0) {
    updated = moveImageEntryToFront(parsed, match.rawIndex);
  }

  if (updated === parsed && match.rawIndex === 0) {
    return NextResponse.json<MakePrimarySuccessResponse>({
      ok: true,
      product: { id: product.id, slug: product.slug },
      moved_from_index: 0,
      images: normalized.map((entry) => ({
        url: entry.url,
        source: entry.source,
        image_id: entry.imageId ?? null,
        variant: entry.variant ?? null,
        variant_url_public: entry.variantUrlPublic ?? null
      })),
      duration_ms: 0,
      revalidated: false,
      purge: { attempted: false, ok: true }
    });
  }

  const serialized = toImagesJsonString(updated);

  try {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE products SET images_json = ?, last_tidb_update_at = NOW(6) WHERE ${
        product.slug ? 'slug' : 'id'
      } = ? LIMIT 1`,
      [serialized, product.slug || product.id]
    );

    console.log('[cf-images][make-primary] success', {
      slug: product.slug,
      moved_from_index: match.rawIndex,
      rows_affected: typeof result.affectedRows === 'number' ? result.affectedRows : null
    });
  } catch (error) {
    console.error('[cf-images][make-primary] database_error', {
      slug: product.slug,
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json<MakePrimaryErrorResponse>(
      { ok: false, error_code: 'database_error', message: 'Error actualizando TiDB' },
      { status: 500 }
    );
  }

  clearProductCache(product.slug);

  let revalidated = false;
  try {
    if (product.slug) {
      revalidatePath(`/p/${product.slug}`);
      revalidated = true;
    }
  } catch (error) {
    console.error('[cf-images][make-primary] revalidate_failed', {
      slug: product.slug,
      message: error instanceof Error ? error.message : String(error)
    });
  }

  const env = readCloudflareEnv();
  const purgeInfo: MakePrimarySuccessResponse['purge'] = { attempted: false, ok: true };

  if (env.enablePurgeOnPublish) {
    const credentials = getCloudflareCredentials();
    if (credentials) {
      try {
        const nextRequest = new NextRequest(request.url, { headers: request.headers });
        const siteUrl = ensureSiteUrl(nextRequest);
        if (product.slug) {
          const productUrl = new URL(`/p/${product.slug}`, siteUrl).toString();
          purgeInfo.attempted = true;
          const purgeResult = await purgeFiles(credentials, [productUrl], {
            label: 'assets-make-primary'
          });
          purgeInfo.ok = purgeResult.ok;
          purgeInfo.latency_ms = purgeResult.duration;
          purgeInfo.ray_ids = purgeResult.rayIds;
          purgeInfo.status = purgeResult.status ?? null;
        }
      } catch (error) {
        purgeInfo.attempted = true;
        purgeInfo.ok = false;
        console.error('[cf-images][make-primary] purge_failed', {
          slug: product.slug,
          message: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  const duration = Date.now() - startedAt;
  const refreshedNormalized = normalizeImages(updated, baseUrl);

  return NextResponse.json<MakePrimarySuccessResponse>({
    ok: true,
    product: { id: product.id, slug: product.slug },
    moved_from_index: match.rawIndex,
    images: refreshedNormalized.map((entry) => ({
      url: entry.url,
      source: entry.source,
      image_id: entry.imageId ?? null,
      variant: entry.variant ?? null,
      variant_url_public: entry.variantUrlPublic ?? null
    })),
    duration_ms: duration,
    revalidated,
    purge: purgeInfo
  });
}
