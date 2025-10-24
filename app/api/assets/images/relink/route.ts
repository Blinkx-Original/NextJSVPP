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
import {
  getProductForImages,
  normalizeImages,
  parseImagesJson,
  replaceImageEntry,
  toImagesJsonString
} from '@/lib/product-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface RelinkPayload {
  slugOrId?: unknown;
  slug?: unknown;
  id?: unknown;
  url?: unknown;
}

interface RelinkSuccessResponse {
  ok: true;
  product: {
    id: string;
    slug: string;
  };
  original_url: string;
  image: {
    url: string;
    image_id: string;
    variant: string;
    source: 'cloudflare';
  };
  download_latency_ms: number;
  upload_latency_ms: number;
  upload_ray_id: string | null;
}

interface RelinkErrorResponse {
  ok: false;
  error_code:
    | 'invalid_payload'
    | 'cf_images_disabled'
    | 'missing_credentials'
    | 'missing_base_url'
    | 'product_not_found'
    | 'image_not_found'
    | 'image_already_cloudflare'
    | 'download_failed'
    | 'unsupported_type'
    | 'file_too_large'
    | 'upload_failed'
    | 'database_error';
  message?: string;
  status?: number;
}

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOWNLOAD_TIMEOUT_MS = 20_000;

interface DownloadResult {
  ok: boolean;
  status?: number;
  buffer?: ArrayBuffer;
  latency: number;
  contentType?: string | null;
  size?: number;
  message?: string;
}

async function downloadImage(url: string): Promise<DownloadResult> {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store'
    });
    const latency = Date.now() - startedAt;
    const status = response.status;

    if (!response.ok) {
      return { ok: false, status, latency, message: `HTTP ${status}` };
    }

    const lengthHeader = response.headers.get('content-length');
    if (lengthHeader) {
      const declared = Number.parseInt(lengthHeader, 10);
      if (Number.isFinite(declared) && declared > MAX_FILE_SIZE) {
        return { ok: false, status: 413, latency, message: 'Content-Length excede el máximo permitido' };
      }
    }

    const contentTypeHeader = response.headers.get('content-type');
    const contentType = contentTypeHeader ? contentTypeHeader.split(';')[0]?.trim().toLowerCase() : null;
    if (contentType && !ALLOWED_TYPES.has(contentType)) {
      return { ok: false, status: 415, latency, message: 'Tipo de contenido no soportado' };
    }

    const buffer = await response.arrayBuffer();
    const size = buffer.byteLength;
    if (size > MAX_FILE_SIZE) {
      return { ok: false, status: 413, latency, message: 'El archivo supera el límite de 10 MB' };
    }

    return { ok: true, status, buffer, latency, contentType: contentType ?? undefined, size };
  } catch (error) {
    const latency = Date.now() - startedAt;
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, status: 504, latency, message: 'timeout' };
    }
    return {
      ok: false,
      latency,
      message: error instanceof Error ? error.message : 'network_error'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

function resolveSlugOrId(payload: RelinkPayload): string | null {
  const candidates = [payload.slugOrId, payload.slug, payload.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function resolveUrl(payload: RelinkPayload): string | null {
  if (typeof payload.url === 'string' && payload.url.trim()) {
    return payload.url.trim();
  }
  return null;
}

function pickFileName(sourceUrl: string, contentType?: string | null): string {
  try {
    const parsed = new URL(sourceUrl);
    const segments = parsed.pathname.split('/').filter(Boolean);
    const last = segments.pop();
    if (last && last.length > 0) {
      return last;
    }
  } catch {
    // ignore
  }
  if (contentType === 'image/png') {
    return 'relinked-image.png';
  }
  if (contentType === 'image/webp') {
    return 'relinked-image.webp';
  }
  return 'relinked-image.jpg';
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const config = readCloudflareImagesConfig();
  if (!config.enabled) {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'cf_images_disabled', message: 'Cloudflare Images no está habilitado' },
      { status: 503 }
    );
  }

  const credentials = getCloudflareImagesCredentials(config);
  if (!credentials) {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'missing_credentials', message: 'Faltan credenciales de Cloudflare Images' },
      { status: 500 }
    );
  }

  if (!config.baseUrl) {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'missing_base_url', message: 'CF_IMAGES_BASE_URL no está configurado' },
      { status: 500 }
    );
  }

  let payload: RelinkPayload;
  try {
    payload = (await request.json()) as RelinkPayload;
  } catch (error) {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'invalid_payload', message: 'JSON inválido' },
      { status: 400 }
    );
  }

  const slugOrId = resolveSlugOrId(payload);
  const sourceUrl = resolveUrl(payload);

  if (!slugOrId || !sourceUrl) {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'invalid_payload', message: 'slugOrId y url son requeridos' },
      { status: 400 }
    );
  }

  const product = await getProductForImages({ slug: slugOrId, id: slugOrId });
  if (!product) {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'product_not_found', message: 'Producto no encontrado' },
      { status: 404 }
    );
  }

  const parsed = parseImagesJson(product.imagesJson);
  const normalized = normalizeImages(parsed, config.baseUrl);
  const match = normalized.find((entry) => entry.url === sourceUrl);

  if (!match) {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'image_not_found', message: 'La URL no está en el producto' },
      { status: 404 }
    );
  }

  if (match.source === 'cloudflare') {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'image_already_cloudflare', message: 'La imagen ya es de Cloudflare' },
      { status: 400 }
    );
  }

  const download = await downloadImage(sourceUrl);
  if (!download.ok || !download.buffer) {
    const status = download.status ?? 502;
    const errorCode =
      status === 404
        ? 'download_failed'
        : status === 415
          ? 'unsupported_type'
          : status === 413
            ? 'file_too_large'
            : 'download_failed';
    let message = download.message ?? 'No se pudo descargar la imagen';
    if (status === 404) {
      message = 'Origen no encontrado (404)';
    } else if (status === 415) {
      message = 'Tipo de contenido no soportado';
    } else if (status === 413) {
      message = 'El archivo supera el límite de 10 MB';
    }
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: errorCode, message, status },
      { status }
    );
  }

  const fileName = pickFileName(sourceUrl, download.contentType);
  const contentType = download.contentType ?? 'image/jpeg';
  const file = new File([download.buffer], fileName, { type: contentType });

  const uploadResult = await uploadCloudflareImage(credentials, file);
  if (!uploadResult.ok || !uploadResult.body?.success || !uploadResult.body.result?.id) {
    const status = uploadResult.status ?? 502;
    console.error('[cf-images][relink] upload_failed', {
      slug: product.slug,
      status,
      error_code: uploadResult.errorCode ?? null
    });
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'upload_failed', message: 'No se pudo subir la imagen a Cloudflare', status },
      { status }
    );
  }

  const imageId = uploadResult.body.result.id;
  const variant = 'public';
  const deliveryUrl = buildDeliveryUrl(config.baseUrl, imageId, variant);
  if (!deliveryUrl) {
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'upload_failed', message: 'No se pudo construir la URL de entrega' },
      { status: 502 }
    );
  }

  const updated = replaceImageEntry(parsed, match.rawIndex, deliveryUrl, {
    imageId,
    variant
  });
  const serialized = toImagesJsonString(updated);

  try {
    const [result] = await getPool().query<ResultSetHeader>(
      `UPDATE products SET images_json = ?, last_tidb_update_at = NOW(6) WHERE ${
        product.slug ? 'slug' : 'id'
      } = ? LIMIT 1`,
      [serialized, product.slug || product.id]
    );

    console.log('[cf-images][relink] success', {
      slug: product.slug,
      image_id: imageId,
      rows_affected: typeof result.affectedRows === 'number' ? result.affectedRows : null
    });
  } catch (error) {
    console.error('[cf-images][relink] database_error', {
      slug: product.slug,
      image_id: imageId,
      message: error instanceof Error ? error.message : String(error)
    });
    return NextResponse.json<RelinkErrorResponse>(
      { ok: false, error_code: 'database_error', message: 'Error actualizando TiDB' },
      { status: 500 }
    );
  }

  return NextResponse.json<RelinkSuccessResponse>({
    ok: true,
    product: { id: product.id, slug: product.slug },
    original_url: sourceUrl,
    image: {
      url: deliveryUrl,
      image_id: imageId,
      variant,
      source: 'cloudflare'
    },
    download_latency_ms: download.latency,
    upload_latency_ms: uploadResult.durationMs,
    upload_ray_id: uploadResult.rayId ?? null
  });
}
