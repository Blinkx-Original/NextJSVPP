import { NextRequest, NextResponse } from 'next/server';
import { getPublishedSlugsForDebug } from '@/lib/products';

function createRequestId() {
  return Math.random().toString(36).slice(2, 8);
}

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
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
