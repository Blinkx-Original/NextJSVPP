import { NextRequest, NextResponse } from 'next/server';

const BASIC_AUTH_PREFIX = 'Basic ';

function isAdminRoute(url: URL) {
  return url.pathname.startsWith('/admin');
}

export function middleware(request: NextRequest) {
  const url = request.nextUrl;
  if (!isAdminRoute(url)) {
    return NextResponse.next();
  }

  const username = process.env.ADMIN_USER || 'admin';
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    return new NextResponse('Admin password not configured', { status: 503 });
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

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*']
};
