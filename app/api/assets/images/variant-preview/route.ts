import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/basic-auth';
import { buildDeliveryUrl, readCloudflareImagesConfig } from '@/lib/cloudflare-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface PreviewSuccessResponse {
  ok: true;
  url: string;
  status: number;
  latency_ms: number;
  ray_id: string | null;
  content_length: number | null;
}

interface PreviewErrorResponse {
  ok: false;
  error_code: 'cf_images_disabled' | 'missing_base_url' | 'invalid_query' | 'preview_failed';
  message?: string;
  status?: number;
  latency_ms?: number;
  ray_id?: string | null;
  content_length?: number | null;
  error_details?: unknown;
}

const TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;

async function headRequest(url: string): Promise<{
  ok: boolean;
  status: number;
  latency: number;
  rayId: string | null;
  contentLength: number | null;
}> {
  let attempt = 0;
  let lastError: {
    ok: boolean;
    status: number;
    latency: number;
    rayId: string | null;
    contentLength: number | null;
  } | null = null;

  while (attempt <= MAX_RETRIES) {
    attempt += 1;
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const response = await fetch(url, { method: 'HEAD', signal: controller.signal });
      const latency = Date.now() - startedAt;
      const rayId = response.headers.get('cf-ray');
      const contentLengthHeader = response.headers.get('content-length');
      const contentLength = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null;

      const result = {
        ok: response.ok,
        status: response.status,
        latency,
        rayId,
        contentLength: Number.isFinite(contentLength) ? contentLength : null
      };

      if (response.ok || response.status < 500 || attempt > MAX_RETRIES) {
        clearTimeout(timeoutId);
        return result;
      }

      lastError = result;
    } catch (error) {
      const latency = Date.now() - startedAt;
      lastError = {
        ok: false,
        status: 0,
        latency,
        rayId: null,
        contentLength: null
      };
      clearTimeout(timeoutId);
      throw error;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return lastError ?? { ok: false, status: 0, latency: 0, rayId: null, contentLength: null };
}

export async function GET(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const config = readCloudflareImagesConfig();
  if (!config.enabled) {
    return NextResponse.json<PreviewErrorResponse>(
      { ok: false, error_code: 'cf_images_disabled', message: 'Cloudflare Images no está habilitado' },
      { status: 503 }
    );
  }

  if (!config.baseUrl) {
    return NextResponse.json<PreviewErrorResponse>(
      { ok: false, error_code: 'missing_base_url', message: 'Falta CF_IMAGES_BASE_URL' },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(request.url);
  const imageId = searchParams.get('imageId')?.trim();
  const variantRaw = searchParams.get('variant')?.trim();
  const variant = variantRaw && variantRaw.length > 0 ? variantRaw : 'public';

  if (!imageId) {
    return NextResponse.json<PreviewErrorResponse>(
      { ok: false, error_code: 'invalid_query', message: 'imageId es requerido' },
      { status: 400 }
    );
  }

  const url = buildDeliveryUrl(config.baseUrl, imageId, variant);
  if (!url) {
    return NextResponse.json<PreviewErrorResponse>(
      { ok: false, error_code: 'missing_base_url', message: 'No se pudo construir la URL de previsualización' },
      { status: 500 }
    );
  }

  try {
    const result = await headRequest(url);

    if (result.ok) {
      console.log('[cf-images][variant-preview] success', {
        image_id: imageId,
        variant,
        status: result.status,
        latency_ms: result.latency,
        ray_id: result.rayId ?? null,
        content_length: result.contentLength
      });

      return NextResponse.json<PreviewSuccessResponse>({
        ok: true,
        url,
        status: result.status,
        latency_ms: result.latency,
        ray_id: result.rayId ?? null,
        content_length: result.contentLength
      });
    }

    console.error('[cf-images][variant-preview] failed', {
      image_id: imageId,
      variant,
      status: result.status,
      latency_ms: result.latency,
      ray_id: result.rayId ?? null
    });

    return NextResponse.json<PreviewErrorResponse>(
      {
        ok: false,
        error_code: 'preview_failed',
        message: 'No se pudo obtener la previsualización',
        status: result.status,
        latency_ms: result.latency,
        ray_id: result.rayId ?? null,
        content_length: result.contentLength
      },
      { status: result.status || 502 }
    );
  } catch (error) {
    console.error('[cf-images][variant-preview] error', {
      image_id: imageId,
      variant,
      message: (error as Error)?.message
    });

    return NextResponse.json<PreviewErrorResponse>(
      {
        ok: false,
        error_code: 'preview_failed',
        message: 'Error ejecutando la previsualización',
        error_details: { message: (error as Error)?.message }
      },
      { status: 502 }
    );
  }
}
