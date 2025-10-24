import { NextRequest, NextResponse } from 'next/server';
import {
  ADMIN_AUTH_COOKIE_NAME,
  ADMIN_TOKEN_HEADER,
  getAdminAuthCookieValue,
  validateAdminSessionToken
} from '@/lib/basic-auth';

const BASIC_AUTH_PREFIX = 'Basic ';

function isProtectedRoute(url: URL) {
  return url.pathname.startsWith('/admin') || url.pathname.startsWith('/api/assets/images');
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  if (!isProtectedRoute(url)) {
    return NextResponse.next();
  }

  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse('Admin password not configured', { status: 503 });
  }

  const expectedCookieValue = getAdminAuthCookieValue();
  const existingCookie = expectedCookieValue ? request.cookies.get(ADMIN_AUTH_COOKIE_NAME) : null;

  if (expectedCookieValue && existingCookie?.value === expectedCookieValue) {
    return NextResponse.next();
  }

  const tokenHeader = request.headers.get(ADMIN_TOKEN_HEADER);
  if (validateAdminSessionToken(tokenHeader)) {
    return NextResponse.next();
  }

  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith(BASIC_AUTH_PREFIX)) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: {
        'WWW-Authenticate': 'Basic realm="Admin"'
      }
    });
  }

  const decodedAuth = Buffer.from(authHeader.slice(BASIC_AUTH_PREFIX.length), 'base64').toString();
  const separatorIndex = decodedAuth.indexOf(':');
  const providedUser = separatorIndex >= 0 ? decodedAuth.slice(0, separatorIndex) : '';
  const providedPassword = separatorIndex >= 0 ? decodedAuth.slice(separatorIndex + 1) : '';

  if (providedUser !== username || providedPassword !== password) {
    return new NextResponse('Invalid credentials', { status: 401 });
  }

  const response = NextResponse.next();
  if (expectedCookieValue) {
    response.cookies.set({
      name: ADMIN_AUTH_COOKIE_NAME,
      value: expectedCookieValue,
      path: '/',
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.NODE_ENV !== 'development',
      maxAge: 60 * 60 * 12 // 12 hours
    });
  }

  return response;
}

export const config = {
  matcher: ['/admin/:path*', '/api/assets/images/:path*']
};
