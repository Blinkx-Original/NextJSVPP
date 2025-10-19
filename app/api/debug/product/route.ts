import { NextRequest, NextResponse } from 'next/server';
import { toDbErrorInfo } from '@/lib/db';
import { getProductRecordBySlug } from '@/lib/products';
import { createRequestId } from '@/lib/request-id';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug');

  if (!slug) {
    console.warn(`[debug/product][${requestId}] missing slug parameter`);
    return NextResponse.json({ error: 'missing_slug' }, { status: 400 });
  }

  try {
    const record = await getProductRecordBySlug(slug);
    const duration = Date.now() - startedAt;
    if (!record) {
      console.log(`[debug/product][${requestId}] slug=${slug} not found (${duration}ms)`);
      return NextResponse.json({ error: 'not_found' }, { status: 404 });
    }
    console.log(`[debug/product][${requestId}] slug=${slug} (${duration}ms)`);
    return NextResponse.json(record);
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(`[debug/product][${requestId}] query failed for slug=${slug} (${duration}ms)`, error);
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
