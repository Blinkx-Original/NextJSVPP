import { NextResponse } from 'next/server';
import type { ResultSetHeader } from 'mysql2/promise';
import { requireAdminAuth } from '@/lib/basic-auth';
import { readCloudflareImagesConfig } from '@/lib/cloudflare-images';
import { getPool } from '@/lib/db';
import { getProductForImages, parseImagesJson, removeImageEntries, toImagesJsonString } from '@/lib/product-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface RemovePayload {
  slugOrId?: unknown;
  urlOrImageId?: unknown;
}

interface RemoveSuccessResponse {
  ok: true;
  removed: number;
  product: {
    id: string;
    slug: string;
  };
  removed_entries: Array<{
    url: string;
    image_id: string | null | undefined;
  }>;
}

interface RemoveErrorResponse {
  ok: false;
  error_code: 'invalid_payload' | 'product_not_found' | 'image_not_found' | 'database_error';
  message?: string;
}

function looksLikeUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value);
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  let payload: RemovePayload;
  try {
    payload = (await request.json()) as RemovePayload;
  } catch (error) {
    return NextResponse.json<RemoveErrorResponse>(
      {
        ok: false,
        error_code: 'invalid_payload',
        message: 'JSON inválido',
      },
      { status: 400 }
    );
  }

  const slugOrId = typeof payload.slugOrId === 'string' ? payload.slugOrId.trim() : '';
  const urlOrImageId = typeof payload.urlOrImageId === 'string' ? payload.urlOrImageId.trim() : '';

  if (!slugOrId || !urlOrImageId) {
    return NextResponse.json<RemoveErrorResponse>(
      {
        ok: false,
        error_code: 'invalid_payload',
        message: 'slugOrId y urlOrImageId son requeridos'
      },
      { status: 400 }
    );
  }

  const product = await getProductForImages({ slug: slugOrId, id: slugOrId });
  if (!product) {
    return NextResponse.json<RemoveErrorResponse>(
      { ok: false, error_code: 'product_not_found', message: 'Producto no encontrado' },
      { status: 404 }
    );
  }

  const config = readCloudflareImagesConfig();
  const parsed = parseImagesJson(product.imagesJson);
  const targetIsUrl = looksLikeUrl(urlOrImageId);

  const removal = removeImageEntries(
    parsed,
    (entry) => {
      if (targetIsUrl) {
        return entry.url === urlOrImageId;
      }
      return entry.imageId === urlOrImageId || entry.url === urlOrImageId;
    },
    config.baseUrl
  );

  if (removal.removed.length === 0) {
    return NextResponse.json<RemoveErrorResponse>(
      { ok: false, error_code: 'image_not_found', message: 'Imagen no encontrada en el producto' },
      { status: 404 }
    );
  }

  const serialized = toImagesJsonString(removal.parsed);

  try {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE products SET images_json = ?, last_tidb_update_at = NOW(6) WHERE ${product.slug ? 'slug' : 'id'} = ? LIMIT 1`,
      [serialized, product.slug || product.id]
    );

    console.log('[cf-images][remove-from-product] success', {
      slug: product.slug,
      removed: removal.removed.length,
      rows_affected: typeof result.affectedRows === 'number' ? result.affectedRows : null
    });

    return NextResponse.json<RemoveSuccessResponse>({
      ok: true,
      removed: removal.removed.length,
      product: { id: product.id, slug: product.slug },
      removed_entries: removal.removed.map((entry) => ({
        url: entry.url,
        image_id: entry.imageId ?? null
      }))
    });
  } catch (error) {
    console.error('[cf-images][remove-from-product] database_error', {
      message: (error as Error)?.message,
      slug: product.slug
    });
    return NextResponse.json<RemoveErrorResponse>(
      { ok: false, error_code: 'database_error', message: 'Error actualizando TiDB' },
      { status: 500 }
    );
  }
}
