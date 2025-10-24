import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/basic-auth';
import {
  deleteCloudflareImage,
  getCloudflareImagesCredentials,
  readCloudflareImagesConfig
} from '@/lib/cloudflare-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface DeleteSuccessResponse {
  ok: true;
  status: number | null;
  latency_ms: number;
  ray_id: string | null;
}

interface DeleteErrorResponse {
  ok: false;
  error_code:
    | 'cf_images_disabled'
    | 'missing_credentials'
    | 'invalid_image_id'
    | 'delete_failed';
  message?: string;
  latency_ms?: number;
  ray_id?: string | null;
  status?: number | null;
  error_details?: unknown;
}

export async function DELETE(
  request: Request,
  context: { params: { imageId?: string } }
) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const config = readCloudflareImagesConfig();
  if (!config.enabled) {
    return NextResponse.json<DeleteErrorResponse>(
      { ok: false, error_code: 'cf_images_disabled', message: 'Cloudflare Images no está habilitado' },
      { status: 503 }
    );
  }

  const credentials = getCloudflareImagesCredentials(config);
  if (!credentials) {
    return NextResponse.json<DeleteErrorResponse>(
      { ok: false, error_code: 'missing_credentials', message: 'Faltan credenciales de Cloudflare Images' },
      { status: 500 }
    );
  }

  const imageId = context.params.imageId?.trim();
  if (!imageId) {
    return NextResponse.json<DeleteErrorResponse>(
      { ok: false, error_code: 'invalid_image_id', message: 'imageId es requerido' },
      { status: 400 }
    );
  }

  const result = await deleteCloudflareImage(credentials, imageId);
  if (result.ok && result.body?.success) {
    console.log('[cf-images][delete] success', {
      image_id: imageId,
      status: result.status ?? null,
      latency_ms: result.durationMs,
      ray_id: result.rayId ?? null
    });
    return NextResponse.json<DeleteSuccessResponse>({
      ok: true,
      status: result.status ?? null,
      latency_ms: result.durationMs,
      ray_id: result.rayId ?? null
    });
  }

  console.error('[cf-images][delete] failed', {
    image_id: imageId,
    status: result.status ?? null,
    latency_ms: result.durationMs,
    ray_id: result.rayId ?? null,
    error_code: result.errorCode ?? null
  });

  return NextResponse.json<DeleteErrorResponse>(
    {
      ok: false,
      error_code: 'delete_failed',
      message: 'No se pudo eliminar la imagen en Cloudflare',
      latency_ms: result.durationMs,
      ray_id: result.rayId ?? null,
      status: result.status ?? null,
      error_details: result.body ?? result.errorDetails
    },
    { status: result.status ?? 502 }
  );
}
