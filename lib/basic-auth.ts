import { NextResponse } from 'next/server';

const BASIC_AUTH_PREFIX = 'Basic ';
export const ADMIN_AUTH_COOKIE_NAME = 'vpp-admin-auth';

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

export function requireAdminAuth(request: Request): AdminAuthResult {
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
