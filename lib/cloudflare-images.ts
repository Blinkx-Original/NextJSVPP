const CF_IMAGES_API_BASE = 'https://api.cloudflare.com/client/v4';
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_RETRIES = 1;

export interface CloudflareImagesConfig {
  enabled: boolean;
  accountId?: string;
  token?: string;
  baseUrl?: string;
}

export interface CloudflareImagesCredentials {
  accountId: string;
  token: string;
}

export type CloudflareImagesErrorCode = 'network_error' | 'timeout' | 'api_error';

export interface CloudflareImagesRequestResult<T = unknown> {
  ok: boolean;
  status?: number;
  durationMs: number;
  rayId?: string | null;
  body?: T | null;
  errorCode?: CloudflareImagesErrorCode;
  errorDetails?: unknown;
}

export interface CloudflareImagesUploadResponse {
  success?: boolean;
  result?: {
    id?: string;
    filename?: string | null;
    requireSignedURLs?: boolean;
    uploaded?: string;
    variants?: string[];
    [key: string]: unknown;
  } | null;
  errors?: Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
}

export interface CloudflareImagesDeleteResponse {
  success?: boolean;
  result?: Record<string, unknown> | null;
  errors?: Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
}

export function readCloudflareImagesConfig(): CloudflareImagesConfig {
  const enabledRaw = process.env.CF_IMAGES_ENABLED?.trim().toLowerCase();
  const enabled = enabledRaw === '1' || enabledRaw === 'true' || enabledRaw === 'yes' || enabledRaw === 'on';
  const accountId = process.env.CF_IMAGES_ACCOUNT_ID?.trim() || undefined;
  const token = process.env.CF_IMAGES_TOKEN?.trim() || undefined;
  const baseUrl = process.env.CF_IMAGES_BASE_URL?.trim() || undefined;
  return { enabled, accountId, token, baseUrl };
}

export function getCloudflareImagesCredentials(
  config: CloudflareImagesConfig
): CloudflareImagesCredentials | null {
  if (!config.enabled) {
    return null;
  }
  if (!config.accountId || !config.token) {
    return null;
  }
  return { accountId: config.accountId, token: config.token };
}

export function normalizeBaseUrl(baseUrl: string | undefined): string | null {
  if (!baseUrl) {
    return null;
  }
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
}

export function buildDeliveryUrl(
  baseUrl: string | undefined,
  imageId: string,
  variant?: string | null
): string | null {
  const normalizedBase = normalizeBaseUrl(baseUrl);
  if (!normalizedBase) {
    return null;
  }
  const cleanImageId = imageId.trim();
  if (!cleanImageId) {
    return null;
  }
  const cleanVariant = (variant ?? 'public').trim() || 'public';
  return `${normalizedBase}${cleanImageId}/${cleanVariant}`;
}

async function callCloudflareImagesApi<T = unknown>(
  credentials: CloudflareImagesCredentials,
  path: string,
  init: RequestInit & { parseJson?: boolean }
): Promise<CloudflareImagesRequestResult<T>> {
  const url = `${CF_IMAGES_API_BASE}/accounts/${credentials.accountId}${path}`;

  let lastError: CloudflareImagesRequestResult<T> | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const startedAt = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers ?? {}),
          Authorization: `Bearer ${credentials.token}`
        },
        signal: controller.signal
      });

      const duration = Date.now() - startedAt;
      const rayId = response.headers.get('cf-ray');
      let body: T | null = null;

      if (init.parseJson !== false) {
        try {
          body = (await response.json()) as T;
        } catch {
          body = null;
        }
      }

      if (response.ok) {
        clearTimeout(timeoutId);
        return { ok: true, status: response.status, durationMs: duration, rayId, body };
      }

      const result: CloudflareImagesRequestResult<T> = {
        ok: false,
        status: response.status,
        durationMs: duration,
        rayId,
        body,
        errorCode: 'api_error'
      };

      lastError = result;

      if (response.status >= 500 && response.status < 600 && attempt < MAX_RETRIES) {
        continue;
      }

      clearTimeout(timeoutId);
      return result;
    } catch (error) {
      const duration = Date.now() - startedAt;
      const errorCode = error instanceof Error && error.name === 'AbortError' ? 'timeout' : 'network_error';
      const result: CloudflareImagesRequestResult<T> = {
        ok: false,
        durationMs: duration,
        errorCode,
        errorDetails: error instanceof Error ? { message: error.message } : undefined
      };
      lastError = result;
      clearTimeout(timeoutId);
      return result;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return (
    lastError ?? {
      ok: false,
      durationMs: 0,
      errorCode: 'network_error'
    }
  );
}

export async function uploadCloudflareImage(
  credentials: CloudflareImagesCredentials,
  file: File
): Promise<CloudflareImagesRequestResult<CloudflareImagesUploadResponse>> {
  const formData = new FormData();
  formData.append('file', file, file.name || 'upload');

  return callCloudflareImagesApi<CloudflareImagesUploadResponse>(credentials, '/images/v1', {
    method: 'POST',
    body: formData
  });
}

export async function deleteCloudflareImage(
  credentials: CloudflareImagesCredentials,
  imageId: string
): Promise<CloudflareImagesRequestResult<CloudflareImagesDeleteResponse>> {
  const cleanId = imageId.trim();
  return callCloudflareImagesApi<CloudflareImagesDeleteResponse>(credentials, `/images/v1/${encodeURIComponent(cleanId)}`, {
    method: 'DELETE'
  });
}
