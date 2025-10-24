import crypto from 'crypto';
import { NextResponse } from 'next/server';

const BASIC_AUTH_PREFIX = 'Basic ';
export const ADMIN_AUTH_COOKIE_NAME = 'vpp-admin-auth';
export const ADMIN_TOKEN_HEADER = 'x-admin-token';
export const ADMIN_TOKEN_QUERY_PARAM = 'adminToken';
const ADMIN_TOKEN_MAX_AGE_SECONDS = 60 * 15; // 15 minutes

interface AdminTokenPayload {
  nonce: string;
  issuedAt: number;
}

function toBase64Url(buffer: Buffer): string {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromBase64Url(input: string): Buffer {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(normalized + padding, 'base64');
}

function encodeTokenPayload(payload: AdminTokenPayload): string {
  return toBase64Url(Buffer.from(JSON.stringify(payload)));
}

function decodeTokenPayload(encoded: string): AdminTokenPayload | null {
  try {
    const json = fromBase64Url(encoded).toString();
    const payload = JSON.parse(json) as AdminTokenPayload;
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    if (typeof payload.nonce !== 'string' || typeof payload.issuedAt !== 'number') {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function getAdminPassword(): string | null {
  const password = process.env.ADMIN_PASSWORD;
  return password ? password : null;
}

function getAdminTokenSecret(): string | null {
  const password = getAdminPassword();
  if (!password) {
    return null;
  }
  return toBase64Url(crypto.createHash('sha256').update(password).digest());
}

function signTokenPayload(payload: AdminTokenPayload): string | null {
  const secret = getAdminTokenSecret();
  if (!secret) {
    return null;
  }
  const serialized = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(serialized);
  return toBase64Url(hmac.digest());
}

export function issueAdminSessionToken(): string | null {
  const password = getAdminPassword();
  if (!password) {
    return null;
  }
  const payload: AdminTokenPayload = {
    nonce: toBase64Url(crypto.randomBytes(16)),
    issuedAt: Math.floor(Date.now() / 1000)
  };
  const payloadPart = encodeTokenPayload(payload);
  const signature = signTokenPayload(payload);
  if (!signature) {
    return null;
  }
  return `${payloadPart}.${signature}`;
}

export function validateAdminSessionToken(token: string | null): boolean {
  if (!token) {
    return false;
  }
  const [payloadPart, signature] = token.split('.');
  if (!payloadPart || !signature) {
    return false;
  }
  const payload = decodeTokenPayload(payloadPart);
  if (!payload) {
    return false;
  }
  const expectedSignature = signTokenPayload(payload);
  if (!expectedSignature) {
    return false;
  }
  const providedSig = fromBase64Url(signature);
  const expectedSig = fromBase64Url(expectedSignature);
  if (providedSig.length !== expectedSig.length) {
    return false;
  }
  if (!crypto.timingSafeEqual(providedSig, expectedSig)) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  if (now - payload.issuedAt > ADMIN_TOKEN_MAX_AGE_SECONDS) {
    return false;
  }
  return true;
}

function createAdminAuthCookieValue(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`).toString('base64');
}

function hasValidAdminAuthCookie(request: Request, expectedValue: string): boolean {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) {
    return false;
  }

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const [rawName, ...rest] = cookie.split('=');
    if (!rawName || rest.length === 0) {
      continue;
    }
    const name = rawName.trim();
    if (name !== ADMIN_AUTH_COOKIE_NAME) {
      continue;
    }
    const value = rest.join('=').trim();
    if (value === expectedValue) {
      return true;
    }
  }

  return false;
}

interface AdminAuthResult {
  ok: boolean;
  response?: NextResponse;
}

function extractAdminToken(request: Request): string | null {
  const headerToken = request.headers.get(ADMIN_TOKEN_HEADER);
  if (headerToken) {
    return headerToken;
  }

  try {
    const url = new URL(request.url);
    const queryToken = url.searchParams.get(ADMIN_TOKEN_QUERY_PARAM);
    if (queryToken) {
      return queryToken;
    }
  } catch {
    // ignore parse errors
  }

  return null;
}

export function requireAdminAuth(request: Request): AdminAuthResult {
  const adminToken = extractAdminToken(request);
  if (validateAdminSessionToken(adminToken)) {
    return { ok: true };
  }

  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;

  if (!password) {
    return {
      ok: false,
      response: new NextResponse('Admin password not configured', { status: 503 })
    };
  }

  const expectedCookieValue = createAdminAuthCookieValue(username, password);

  if (hasValidAdminAuthCookie(request, expectedCookieValue)) {
    return { ok: true };
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith(BASIC_AUTH_PREFIX)) {
    return {
      ok: false,
      response: new NextResponse('Authentication required', {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Basic realm="Admin"'
        }
      })
    };
  }

  const decoded = Buffer.from(authHeader.slice(BASIC_AUTH_PREFIX.length), 'base64').toString();
  const separatorIndex = decoded.indexOf(':');
  const providedUser = separatorIndex >= 0 ? decoded.slice(0, separatorIndex) : '';
  const providedPassword = separatorIndex >= 0 ? decoded.slice(separatorIndex + 1) : '';

  if (providedUser !== username || providedPassword !== password) {
    return {
      ok: false,
      response: new NextResponse('Invalid credentials', { status: 401 })
    };
  }

  return { ok: true };
}

export function getAdminAuthCookieValue(): string | null {
  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return null;
  }
  return createAdminAuthCookieValue(username, password);
}
