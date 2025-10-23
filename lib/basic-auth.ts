import { NextResponse } from 'next/server';

const BASIC_AUTH_PREFIX = 'Basic ';

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
