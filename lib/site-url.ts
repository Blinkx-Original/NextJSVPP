import type { NextRequest } from 'next/server';

function pickFirstHeader(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const first = value.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
}

function normalizeBaseUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`.replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function resolveSiteUrl(request?: NextRequest): string | null {
  const forwardedHost = pickFirstHeader(request?.headers.get('x-forwarded-host'));
  const host = forwardedHost ?? pickFirstHeader(request?.headers.get('host'));
  const proto =
    pickFirstHeader(request?.headers.get('x-forwarded-proto')) ??
    (host && host.includes('localhost') ? 'http' : 'https');

  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, '');
  }

  const fallback = process.env.NEXT_PUBLIC_SITE_URL;
  if (typeof fallback === 'string' && fallback.trim()) {
    const normalized = normalizeBaseUrl(fallback.trim());
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export function ensureSiteUrl(request?: NextRequest): string {
  const resolved = resolveSiteUrl(request);
  if (!resolved) {
    throw new Error('Unable to resolve site URL');
  }
  return resolved;
}
