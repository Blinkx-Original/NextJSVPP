import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/basic-auth';
import {
  buildDeliveryUrl,
  getCloudflareImagesCredentials,
  readCloudflareImagesConfig,
  uploadCloudflareImage
} from '@/lib/cloudflare-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface BlogImageUploadSuccessResponse {
  ok: true;
  image_id: string;
  delivery_url: string;
  variant: string;
  latency_ms: number;
  ray_id: string | null;
  size_bytes: number;
}

interface BlogImageUploadErrorResponse {
  ok: false;
  error_code:
    | 'auth_required'
    | 'cf_images_disabled'
    | 'missing_credentials'
    | 'missing_base_url'
    | 'invalid_form'
    | 'file_too_large'
    | 'upload_failed';
  message?: string;
  latency_ms?: number;
  ray_id?: string | null;
  size_bytes?: number;
  error_details?: unknown;
}

function mapUploadError(uploadResult: {
  status?: number;
  errorCode?: string;
  body?: Record<string, any> | null;
}): { error_code: BlogImageUploadErrorResponse['error_code']; message: string } {
  const status = uploadResult.status;
  const firstError = Array.isArray(uploadResult.body?.errors) ? uploadResult.body?.errors[0] : null;
  const apiMessage =
    (typeof firstError?.message === 'string' ? firstError.message : undefined) ??
    (typeof uploadResult.body?.messages?.[0]?.message === 'string'
      ? uploadResult.body?.messages[0].message
      : undefined);

  if (status === 401 || status === 403) {
    return {
      error_code: 'missing_credentials',
      message:
        apiMessage || 'Credenciales de Cloudflare inválidas o sin permisos. Verifica CF_IMAGES_ACCOUNT_ID y CF_IMAGES_TOKEN.'
    };
  }

  if (status === 415) {
    return {
      error_code: 'upload_failed',
      message: apiMessage || 'Tipo de archivo no soportado. Solo se permiten imágenes JPG, PNG o WebP.'
    };
  }

  if (status === 413) {
    return {
      error_code: 'file_too_large',
      message: apiMessage || 'El archivo supera el límite de 10 MB.'
    };
  }

  if (typeof apiMessage === 'string' && apiMessage.length > 0) {
    return { error_code: 'upload_failed', message: apiMessage };
  }

  return {
    error_code: 'upload_failed',
    message: 'No se pudo subir la imagen. Revisa la configuración de Cloudflare e inténtalo de nuevo.'
  };
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response ?? NextResponse.json<BlogImageUploadErrorResponse>(
      { ok: false, error_code: 'auth_required', message: 'Autenticación requerida' },
      { status: 401 }
    );
  }

  const config = readCloudflareImagesConfig();
  if (!config.enabled) {
    return NextResponse.json<BlogImageUploadErrorResponse>(
      { ok: false, error_code: 'cf_images_disabled', message: 'Cloudflare Images no está habilitado' },
      { status: 503 }
    );
  }

  const credentials = getCloudflareImagesCredentials(config);
  if (!credentials) {
    return NextResponse.json<BlogImageUploadErrorResponse>(
      { ok: false, error_code: 'missing_credentials', message: 'Faltan credenciales de Cloudflare Images' },
      { status: 500 }
    );
  }

  if (!config.baseUrl) {
    return NextResponse.json<BlogImageUploadErrorResponse>(
      { ok: false, error_code: 'missing_base_url', message: 'Falta CF_IMAGES_BASE_URL' },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');
  const variantRaw = formData.get('variant');

  if (!(file instanceof File)) {
    return NextResponse.json<BlogImageUploadErrorResponse>(
      { ok: false, error_code: 'invalid_form', message: 'El archivo es requerido' },
      { status: 400 }
    );
  }

  const variant = typeof variantRaw === 'string' && variantRaw.trim() ? variantRaw.trim() : 'public';
  const sizeBytes = typeof file.size === 'number' ? file.size : 0;
  const MAX_SIZE = 10 * 1024 * 1024;
  if (sizeBytes > MAX_SIZE) {
    return NextResponse.json<BlogImageUploadErrorResponse>(
      {
        ok: false,
        error_code: 'file_too_large',
        message: 'El archivo supera el límite de 10 MB',
        size_bytes: sizeBytes
      },
      { status: 413 }
    );
  }

  const uploadResult = await uploadCloudflareImage(credentials, file);

  if (uploadResult.ok && uploadResult.body?.success && uploadResult.body.result?.id) {
    const imageId = uploadResult.body.result.id;
    const deliveryUrl = buildDeliveryUrl(config.baseUrl, imageId, variant);
    if (!deliveryUrl) {
      return NextResponse.json<BlogImageUploadErrorResponse>(
        {
          ok: false,
          error_code: 'upload_failed',
          message: 'No se pudo construir la URL pública de la imagen',
          latency_ms: uploadResult.durationMs,
          ray_id: uploadResult.rayId ?? null,
          size_bytes: sizeBytes
        },
        { status: 502 }
      );
    }

    return NextResponse.json<BlogImageUploadSuccessResponse>({
      ok: true,
      image_id: imageId,
      delivery_url: deliveryUrl,
      variant,
      latency_ms: uploadResult.durationMs,
      ray_id: uploadResult.rayId ?? null,
      size_bytes: sizeBytes
    });
  }

  const { error_code, message } = mapUploadError(uploadResult);

  return NextResponse.json<BlogImageUploadErrorResponse>(
    {
      ok: false,
      error_code,
      message,
      latency_ms: uploadResult.durationMs,
      ray_id: uploadResult.rayId ?? null,
      size_bytes: sizeBytes,
      error_details: uploadResult.body ?? uploadResult.errorDetails
    },
    { status: uploadResult.status ?? 502 }
  );
}
