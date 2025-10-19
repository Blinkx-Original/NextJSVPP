import { NextRequest, NextResponse } from 'next/server';
import { toDbErrorInfo } from '@/lib/db';
import { getPublishedSlugsForDebug } from '@/lib/products';
import { createRequestId } from '@/lib/request-id';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const parsedLimit = limitParam ? Number(limitParam) : 20;
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20;

  try {
    const slugs = await getPublishedSlugsForDebug(limit);
    const duration = Date.now() - startedAt;
    console.log(`[debug/slugs][${requestId}] fetched ${slugs.length} slugs (${duration}ms)`);
    return NextResponse.json(slugs);
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(`[debug/slugs][${requestId}] query failed (${duration}ms)`, error);
    const info = toDbErrorInfo(error);
    const payload: Record<string, unknown> = { error: 'db_error' };
    if (info.code) {
      payload.code = info.code;
    }
    if (typeof info.errno === 'number') {
      payload.errno = info.errno;
    }
    if (info.sqlState) {
      payload.sqlState = info.sqlState;
    }
    return NextResponse.json(payload, { status: 500 });
  }
}
