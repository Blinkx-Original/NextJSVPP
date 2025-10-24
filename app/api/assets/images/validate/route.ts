import { NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/basic-auth';
import { normalizeBaseUrl } from '@/lib/cloudflare-images';
import { getProductForImages, normalizeImages, parseImagesJson } from '@/lib/product-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface ValidatePayload {
  slugOrId?: unknown;
  slug?: unknown;
  id?: unknown;
}

interface ValidateSuccessResponse {
  ok: true;
  product: {
    id: string;
    slug: string;
  };
  results: Array<{
    url: string;
    source: 'cloudflare' | 'external';
    ok: boolean;
    status?: number | null;
    latency_ms?: number | null;
    ray_id?: string | null;
    message?: string | null;
  }>;
}

interface ValidateErrorResponse {
  ok: false;
  error_code: 'invalid_payload' | 'product_not_found';
  message?: string;
}

const VALIDATION_TIMEOUT_MS = 12_000;

async function performRequest(
  url: string,
  method: 'HEAD' | 'GET'
): Promise<{ status?: number; latency: number; rayId?: string | null; ok: boolean; message?: string | null }>
{
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method,
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store'
    });
    const latency = Date.now() - startedAt;
    const status = response.status;
    const ok = status >= 200 && status < 400;
    const rayId = response.headers.get('cf-ray');
    return { status, latency, ok, rayId };
  } catch (error) {
    const latency = Date.now() - startedAt;
    if (error instanceof Error && error.name === 'AbortError') {
      return { status: undefined, latency, ok: false, message: 'timeout' };
    }
    return {
      status: undefined,
      latency,
      ok: false,
      message: error instanceof Error ? error.message : 'network_error'
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function validateUrl(
  url: string
): Promise<{ status?: number | null; latencyMs?: number | null; ok: boolean; rayId?: string | null; message?: string | null }>
{
  const headResult = await performRequest(url, 'HEAD');

  if (headResult.status === 405 || headResult.status === 501) {
    const getResult = await performRequest(url, 'GET');
    return {
      status: getResult.status ?? null,
      latencyMs: getResult.latency,
      ok: getResult.ok,
      rayId: getResult.rayId ?? null,
      message: getResult.message ?? null
    };
  }

  return {
    status: headResult.status ?? null,
    latencyMs: headResult.latency,
    ok: headResult.ok,
    rayId: headResult.rayId ?? null,
    message: headResult.message ?? null
  };
}

function resolveSlugOrId(payload: ValidatePayload): string | null {
  const candidates = [payload.slugOrId, payload.slug, payload.id];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  let payload: ValidatePayload;
  try {
    payload = (await request.json()) as ValidatePayload;
  } catch (error) {
    return NextResponse.json<ValidateErrorResponse>(
      { ok: false, error_code: 'invalid_payload', message: 'JSON inválido' },
      { status: 400 }
    );
  }

  const slugOrId = resolveSlugOrId(payload);
  if (!slugOrId) {
    return NextResponse.json<ValidateErrorResponse>(
      { ok: false, error_code: 'invalid_payload', message: 'slugOrId es requerido' },
      { status: 400 }
    );
  }

  const product = await getProductForImages({ slug: slugOrId, id: slugOrId });
  if (!product) {
    return NextResponse.json<ValidateErrorResponse>(
      { ok: false, error_code: 'product_not_found', message: 'Producto no encontrado' },
      { status: 404 }
    );
  }

  const parsed = parseImagesJson(product.imagesJson);
  const normalized = normalizeImages(parsed, normalizeBaseUrl(process.env.CF_IMAGES_BASE_URL ?? undefined) ?? undefined);

  const results: ValidateSuccessResponse['results'] = [];

  for (const entry of normalized) {
    const validation = await validateUrl(entry.url);
    results.push({
      url: entry.url,
      source: entry.source,
      ok: validation.ok,
      status: validation.status ?? null,
      latency_ms: validation.latencyMs ?? null,
      ray_id: validation.rayId ?? null,
      message: validation.message ?? null
    });
  }

  return NextResponse.json<ValidateSuccessResponse>({
    ok: true,
    product: { id: product.id, slug: product.slug },
    results
  });
}
