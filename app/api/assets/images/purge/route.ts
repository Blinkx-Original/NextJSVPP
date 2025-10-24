import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/basic-auth';
import { getCloudflareCredentials, purgeFiles } from '@/lib/cloudflare';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface PurgePayload {
  url?: unknown;
}

interface PurgeSuccessResponse {
  ok: true;
  latency_ms: number;
  ray_ids: string[];
}

interface PurgeErrorResponse {
  ok: false;
  error_code: 'invalid_payload' | 'missing_env' | 'purge_failed';
  message?: string;
  status?: number;
  ray_ids?: string[];
}

function isValidUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const credentials = getCloudflareCredentials();
  if (!credentials) {
    return NextResponse.json<PurgeErrorResponse>(
      { ok: false, error_code: 'missing_env', message: 'Faltan credenciales de Cloudflare' },
      { status: 500 }
    );
  }

  let payload: PurgePayload;
  try {
    payload = (await request.json()) as PurgePayload;
  } catch (error) {
    return NextResponse.json<PurgeErrorResponse>(
      { ok: false, error_code: 'invalid_payload', message: 'JSON inválido' },
      { status: 400 }
    );
  }

  const url = typeof payload.url === 'string' ? payload.url.trim() : '';
  if (!url || !isValidUrl(url)) {
    return NextResponse.json<PurgeErrorResponse>(
      { ok: false, error_code: 'invalid_payload', message: 'URL inválida' },
      { status: 400 }
    );
  }

  const purgeResult = await purgeFiles(credentials, [url], { label: 'assets-image-purge' });
  if (!purgeResult.ok) {
    const status = purgeResult.status && purgeResult.status >= 400 ? purgeResult.status : 502;
    console.error('[cf-images][purge] failed', {
      url,
      status,
      error_code: purgeResult.errorCode ?? null
    });
    return NextResponse.json<PurgeErrorResponse>(
      {
        ok: false,
        error_code: 'purge_failed',
        message: 'No se pudo purgar la URL en Cloudflare',
        status,
        ray_ids: purgeResult.rayIds
      },
      { status }
    );
  }

  console.log('[cf-images][purge] success', {
    url,
    latency_ms: purgeResult.duration,
    ray_ids: purgeResult.rayIds
  });

  return NextResponse.json<PurgeSuccessResponse>({
    ok: true,
    latency_ms: purgeResult.duration,
    ray_ids: purgeResult.rayIds
  });
}
