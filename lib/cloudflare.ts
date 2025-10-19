import type { NextRequest } from 'next/server';
import { collectPublishedProductsForSitemap } from './products';
import { getLastPublishedBatch } from './publish-state';
import { ensureSiteUrl } from './site-url';
import { SITEMAP_PAGE_SIZE } from './sitemaps';

const CLOUDFLARE_API_BASE = 'https://api.cloudflare.com/client/v4';
const PURGE_CHUNK_SIZE = 2000;
const REQUEST_TIMEOUT_MS = 25_000;
const MAX_PURGE_RETRIES = 1;

type CloudflareBoolean = boolean | undefined;

export type CloudflareErrorCode =
  | 'missing_env'
  | 'auth_failed'
  | 'network_error'
  | 'timeout'
  | 'api_error'
  | 'no_last_batch';

export interface CloudflareEnvConfig {
  zoneId?: string;
  apiToken?: string;
  enablePurgeOnPublish?: CloudflareBoolean;
  includeProductUrls?: CloudflareBoolean;
}

export interface CloudflareCredentials {
  zoneId: string;
  apiToken: string;
}

export interface CloudflareResponseBody {
  success?: boolean;
  result?: Record<string, unknown> | null;
  errors?: Array<Record<string, unknown>>;
  messages?: Array<Record<string, unknown>>;
}

interface CloudflareRequestResult {
  ok: boolean;
  duration: number;
  status?: number;
  rayId?: string | null;
  body?: CloudflareResponseBody | null;
  errorCode?: Exclude<CloudflareErrorCode, 'missing_env' | 'no_last_batch'>;
  errorDetails?: unknown;
}

interface PurgePayload {
  files?: string[];
  purge_everything?: boolean;
}

export interface PurgeExecutionResult {
  ok: boolean;
  duration: number;
  rayIds: string[];
  status?: number;
  errorCode?: CloudflareErrorCode;
  errorDetails?: unknown;
  lastResponse?: CloudflareResponseBody | null;
}

function parseBooleanEnv(value: string | undefined): CloudflareBoolean {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return undefined;
  }
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') {
    return true;
  }
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') {
    return false;
  }
  return undefined;
}

export function readCloudflareEnv(): CloudflareEnvConfig {
  return {
    zoneId: process.env.CLOUDFLARE_ZONE_ID?.trim() || undefined,
    apiToken: process.env.CLOUDFLARE_API_TOKEN?.trim() || undefined,
    enablePurgeOnPublish: parseBooleanEnv(process.env.CLOUDFLARE_ENABLE_PURGE_ON_PUBLISH),
    includeProductUrls: parseBooleanEnv(process.env.CLOUDFLARE_INCLUDE_PRODUCT_URLS)
  };
}

export function getCloudflareCredentials(): CloudflareCredentials | null {
  const env = readCloudflareEnv();
  if (!env.zoneId || !env.apiToken) {
    return null;
  }
  return { zoneId: env.zoneId, apiToken: env.apiToken };
}

export function abbreviateZoneId(zoneId: string): string {
  const trimmed = zoneId.trim();
  if (trimmed.length <= 12) {
    return trimmed;
  }
  const start = trimmed.slice(0, 6);
  const end = trimmed.slice(-4);
  return `${start}…${end}`;
}

function logEvent(message: string, details: Record<string, unknown>): void {
  const timestamp = new Date().toISOString();
  console.log(`[cloudflare] ${message}`, { timestamp, ...details });
}

function toProductUrl(baseUrl: string, slug: string): string | null {
  try {
    const cleanSlug = slug.trim();
    if (!cleanSlug) {
      return null;
    }
    const url = new URL(`/p/${cleanSlug}`, baseUrl);
    return url.toString();
  } catch {
    return null;
  }
}

function toAbsoluteUrl(baseUrl: string, path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const url = new URL(normalizedPath, baseUrl);
  return url.toString();
}

function chunkArray<T>(input: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < input.length; index += size) {
    chunks.push(input.slice(index, index + size));
  }
  return chunks;
}

async function performCloudflareRequest(
  credentials: CloudflareCredentials,
  path: string,
  options: { method: 'GET' | 'POST'; payload?: PurgePayload }
): Promise<CloudflareRequestResult> {
  const url = `${CLOUDFLARE_API_BASE}${path}`;
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${credentials.apiToken}`,
        'Content-Type': 'application/json'
      },
      body: options.payload ? JSON.stringify(options.payload) : undefined,
      signal: controller.signal
    });

    const duration = Date.now() - startedAt;
    const rayId = response.headers.get('cf-ray');
    let body: CloudflareResponseBody | null = null;
    try {
      body = (await response.json()) as CloudflareResponseBody;
    } catch {
      body = null;
    }

    if (response.ok && body?.success) {
      return { ok: true, duration, status: response.status, rayId, body };
    }

    const errorCode = response.status === 401 || response.status === 403 ? 'auth_failed' : 'api_error';
    return { ok: false, duration, status: response.status, rayId, body, errorCode };
  } catch (error) {
    const duration = Date.now() - startedAt;
    if (error instanceof Error && error.name === 'AbortError') {
      return { ok: false, duration, errorCode: 'timeout' };
    }
    return {
      ok: false,
      duration,
      errorCode: 'network_error',
      errorDetails: error instanceof Error ? { message: error.message } : undefined
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function testCloudflareConnection(
  credentials: CloudflareCredentials
): Promise<CloudflareRequestResult> {
  const result = await performCloudflareRequest(credentials, `/zones/${credentials.zoneId}`, { method: 'GET' });
  if (result.ok) {
    logEvent('test-connection', {
      zone: abbreviateZoneId(credentials.zoneId),
      duration_ms: result.duration,
      ray_id: result.rayId ?? null
    });
  } else {
    logEvent('test-connection-error', {
      zone: abbreviateZoneId(credentials.zoneId),
      duration_ms: result.duration,
      ray_id: result.rayId ?? null,
      status: result.status ?? null,
      error_code: result.errorCode ?? null
    });
  }
  return result;
}

async function executePurgeRequest(
  credentials: CloudflareCredentials,
  payload: PurgePayload,
  context: { label: string }
): Promise<CloudflareRequestResult> {
  let lastResult: CloudflareRequestResult | null = null;
  for (let attempt = 0; attempt <= MAX_PURGE_RETRIES; attempt += 1) {
    const result = await performCloudflareRequest(credentials, `/zones/${credentials.zoneId}/purge_cache`, {
      method: 'POST',
      payload
    });
    const urlsCount = payload.files ? payload.files.length : 0;
    if (result.ok) {
      logEvent(`purge-${context.label}`, {
        zone: abbreviateZoneId(credentials.zoneId),
        urls: urlsCount,
        mode: payload.purge_everything ? 'everything' : 'files',
        duration_ms: result.duration,
        ray_id: result.rayId ?? null,
        attempt: attempt + 1
      });
      return result;
    }

    logEvent(`purge-${context.label}-error`, {
      zone: abbreviateZoneId(credentials.zoneId),
      urls: urlsCount,
      mode: payload.purge_everything ? 'everything' : 'files',
      duration_ms: result.duration,
      ray_id: result.rayId ?? null,
      status: result.status ?? null,
      error_code: result.errorCode ?? null,
      attempt: attempt + 1
    });

    lastResult = result;

    const status = result.status ?? 0;
    const shouldRetry =
      attempt < MAX_PURGE_RETRIES &&
      (result.errorCode === 'timeout' || (status >= 500 && status < 600));

    if (!shouldRetry) {
      return result;
    }
  }

  return lastResult ?? {
    ok: false,
    duration: 0,
    errorCode: 'api_error'
  };
}

export async function purgeFiles(
  credentials: CloudflareCredentials,
  files: string[],
  context: { label: string }
): Promise<PurgeExecutionResult> {
  if (files.length === 0) {
    return { ok: true, duration: 0, rayIds: [] };
  }
  const startedAt = Date.now();
  const rayIds: string[] = [];
  const chunks = chunkArray(files, PURGE_CHUNK_SIZE);

  for (const chunk of chunks) {
    const result = await executePurgeRequest(credentials, { files: chunk }, context);
    if (!result.ok) {
      return {
        ok: false,
        duration: Date.now() - startedAt,
        rayIds,
        status: result.status,
        errorCode: result.errorCode ?? 'api_error',
        errorDetails: result.body?.errors ?? result.errorDetails,
        lastResponse: result.body ?? null
      };
    }
    if (result.rayId) {
      rayIds.push(result.rayId);
    }
  }

  return { ok: true, duration: Date.now() - startedAt, rayIds };
}

export async function purgeEverything(
  credentials: CloudflareCredentials,
  context: { label: string }
): Promise<PurgeExecutionResult> {
  const startedAt = Date.now();
  const result = await executePurgeRequest(credentials, { purge_everything: true }, context);
  if (!result.ok) {
    return {
      ok: false,
      duration: Date.now() - startedAt,
      rayIds: result.rayId ? [result.rayId] : [],
      status: result.status,
      errorCode: result.errorCode ?? 'api_error',
      errorDetails: result.body?.errors ?? result.errorDetails,
      lastResponse: result.body ?? null
    };
  }
  const rayIds = result.rayId ? [result.rayId] : [];
  return { ok: true, duration: Date.now() - startedAt, rayIds };
}

export async function buildSitemapPurgeList(request?: NextRequest): Promise<{
  baseUrl: string;
  urls: string[];
  labels: string[];
}> {
  const baseUrl = ensureSiteUrl(request);
  const { batches } = await collectPublishedProductsForSitemap({ pageSize: SITEMAP_PAGE_SIZE });
  const urls = new Set<string>();
  const labels = new Set<string>();

  urls.add(toAbsoluteUrl(baseUrl, '/sitemap_index.xml'));
  labels.add('sitemap_index.xml');

  if (batches.length <= 1) {
    urls.add(toAbsoluteUrl(baseUrl, '/sitemap.xml'));
    labels.add('sitemap.xml');
  } else {
    batches.forEach((_, index) => {
      const name = `sitemaps/sitemap-${index + 1}.xml`;
      urls.add(toAbsoluteUrl(baseUrl, name));
      labels.add(name);
    });
  }

  return {
    baseUrl,
    urls: Array.from(urls),
    labels: Array.from(labels)
  };
}

export function buildLastBatchProductUrls(baseUrl: string): {
  urls: string[];
  slugs: string[];
  createdAt?: number;
} {
  const batch = getLastPublishedBatch();
  if (!batch) {
    return { urls: [], slugs: [] };
  }
  const urls: string[] = [];
  const slugs: string[] = [];
  for (const slug of batch.slugs) {
    const url = toProductUrl(baseUrl, slug);
    if (url) {
      urls.push(url);
      slugs.push(slug);
    }
  }
  return { urls, slugs, createdAt: batch.createdAt };
}
