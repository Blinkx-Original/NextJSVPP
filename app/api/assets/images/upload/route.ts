import { NextResponse } from 'next/server';
import type { ResultSetHeader } from 'mysql2/promise';
import { requireAdminAuth } from '@/lib/basic-auth';
import {
  buildDeliveryUrl,
  getCloudflareImagesCredentials,
  readCloudflareImagesConfig,
  uploadCloudflareImage
} from '@/lib/cloudflare-images';
import { getPool } from '@/lib/db';
import { appendImageEntry, getProductForImages, parseImagesJson, toImagesJsonString } from '@/lib/product-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface UploadSuccessResponse {
  ok: true;
  image_id: string;
  delivery_url: string | null;
  variant: string;
  variants?: string[];
  latency_ms: number;
  ray_id: string | null;
  size_bytes: number;
  product: {
    id: string;
    slug: string;
  };
}

interface UploadErrorResponse {
  ok: false;
  error_code:
    | 'auth_required'
    | 'cf_images_disabled'
    | 'missing_credentials'
    | 'invalid_form'
    | 'file_too_large'
    | 'product_not_found'
    | 'upload_failed'
    | 'missing_image_id'
    | 'database_error'
    | 'missing_base_url';
  message?: string;
  latency_ms?: number;
  ray_id?: string | null;
  size_bytes?: number;
  error_details?: unknown;
}

function resolveDeliveryUrl(
  baseUrl: string | undefined,
  imageId: string,
  variant: string,
  variants: string[] | undefined
): string | null {
  const computed = buildDeliveryUrl(baseUrl, imageId, variant);
  if (computed) {
    return computed;
  }
  if (Array.isArray(variants)) {
    const match = variants.find((entry) => typeof entry === 'string' && entry.endsWith(`/${variant}`));
    if (match) {
      return match;
    }
  }
  return null;
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const config = readCloudflareImagesConfig();
  if (!config.enabled) {
    return NextResponse.json<UploadErrorResponse>(
      { ok: false, error_code: 'cf_images_disabled', message: 'Cloudflare Images no está habilitado' },
      { status: 503 }
    );
  }

  const credentials = getCloudflareImagesCredentials(config);
  if (!credentials) {
    return NextResponse.json<UploadErrorResponse>(
      { ok: false, error_code: 'missing_credentials', message: 'Faltan credenciales de Cloudflare Images' },
      { status: 500 }
    );
  }

  if (!config.baseUrl) {
    return NextResponse.json<UploadErrorResponse>(
      { ok: false, error_code: 'missing_base_url', message: 'Falta CF_IMAGES_BASE_URL' },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const slugOrIdRaw = formData.get('slugOrId') ?? formData.get('slug') ?? formData.get('product');
  const variantRaw = formData.get('variant');

  if (!(file instanceof File)) {
    return NextResponse.json<UploadErrorResponse>(
      { ok: false, error_code: 'invalid_form', message: 'El archivo es requerido' },
      { status: 400 }
    );
  }

  const fileSize = typeof file.size === 'number' ? file.size : 0;
  const MAX_SIZE = 10 * 1024 * 1024;
  if (fileSize > MAX_SIZE) {
    return NextResponse.json<UploadErrorResponse>(
      {
        ok: false,
        error_code: 'file_too_large',
        message: 'El archivo supera el límite de 10 MB',
        size_bytes: fileSize
      },
      { status: 413 }
    );
  }

  const slugOrId = typeof slugOrIdRaw === 'string' ? slugOrIdRaw.trim() : '';
  if (!slugOrId) {
    return NextResponse.json<UploadErrorResponse>(
      { ok: false, error_code: 'invalid_form', message: 'Debe seleccionar un producto' },
      { status: 400 }
    );
  }

  const variant = typeof variantRaw === 'string' && variantRaw.trim() ? variantRaw.trim() : 'public';

  const product = await getProductForImages({ slug: slugOrId, id: slugOrId });
  if (!product) {
    return NextResponse.json<UploadErrorResponse>(
      { ok: false, error_code: 'product_not_found', message: 'Producto no encontrado' },
      { status: 404 }
    );
  }

  const uploadResult = await uploadCloudflareImage(credentials, file);

  if (uploadResult.ok && uploadResult.body?.success && uploadResult.body.result?.id) {
    const imageId = uploadResult.body.result.id;
    const deliveryUrl = resolveDeliveryUrl(config.baseUrl, imageId, variant, uploadResult.body.result.variants);
    if (!deliveryUrl) {
      console.error('[cf-images][upload] missing_delivery_url', {
        image_id: imageId,
        variant,
        slug: product.slug
      });
      return NextResponse.json<UploadErrorResponse>(
        {
          ok: false,
          error_code: 'missing_image_id',
          message: 'No se pudo construir la URL de entrega'
        },
        { status: 502 }
      );
    }

    const parsed = parseImagesJson(product.imagesJson);
    const updated = appendImageEntry(parsed, deliveryUrl, {
      imageId,
      variant
    });
    const serialized = toImagesJsonString(updated);

    try {
      const pool = getPool();
      const identifierValue = product.slug || product.id;
      const identifierField = product.slug ? 'slug' : 'id';
      const [result] = await pool.query<ResultSetHeader>(
        `UPDATE products SET images_json = ?, last_tidb_update_at = NOW(6) WHERE ${identifierField} = ? LIMIT 1`,
        [serialized, identifierValue]
      );

      console.log('[cf-images][upload] success', {
        status: uploadResult.status ?? null,
        latency_ms: uploadResult.durationMs,
        ray_id: uploadResult.rayId ?? null,
        size_bytes: fileSize,
        slug: product.slug,
        rows_affected: typeof result.affectedRows === 'number' ? result.affectedRows : null
      });

      return NextResponse.json<UploadSuccessResponse>({
        ok: true,
        image_id: imageId,
        delivery_url: deliveryUrl,
        variant,
        variants: uploadResult.body.result.variants,
        latency_ms: uploadResult.durationMs,
        ray_id: uploadResult.rayId ?? null,
        size_bytes: fileSize,
        product: { id: product.id, slug: product.slug }
      });
    } catch (error) {
      console.error('[cf-images][upload] database_error', {
        message: (error as Error)?.message,
        slug: product.slug,
        size_bytes: fileSize
      });
      return NextResponse.json<UploadErrorResponse>(
        { ok: false, error_code: 'database_error', message: 'Error actualizando TiDB' },
        { status: 500 }
      );
    }
  }

  console.error('[cf-images][upload] failed', {
    status: uploadResult.status ?? null,
    latency_ms: uploadResult.durationMs,
    ray_id: uploadResult.rayId ?? null,
    size_bytes: fileSize,
    error_code: uploadResult.errorCode ?? null
  });

  return NextResponse.json<UploadErrorResponse>(
    {
      ok: false,
      error_code: uploadResult.errorCode ? 'upload_failed' : 'missing_image_id',
      message: 'No se pudo subir la imagen',
      latency_ms: uploadResult.durationMs,
      ray_id: uploadResult.rayId ?? null,
      size_bytes: fileSize,
      error_details: uploadResult.body ?? uploadResult.errorDetails
    },
    { status: uploadResult.status ?? 502 }
  );
}
