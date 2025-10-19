import { NextResponse } from 'next/server';
import { pingDatabase, toDbErrorInfo } from '@/lib/db';

function createRequestId() {
  return Math.random().toString(36).slice(2, 8);
}

export const runtime = 'nodejs';

export async function GET() {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'dev';

  try {
    await pingDatabase();
    const duration = Date.now() - startedAt;
    console.log(`[healthz][${requestId}] SELECT 1 (${duration}ms)`);
    return NextResponse.json({ ok: true, db: 'up', version });
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(`[healthz][${requestId}] DB healthcheck failed (${duration}ms)`, error);
    const info = toDbErrorInfo(error);
    const payload: Record<string, unknown> = { ok: false, db: 'down', error: 'connection_failed' };
    if (info.code) {
      payload.code = info.code;
    }
    if (typeof info.errno === 'number') {
      payload.errno = info.errno;
    }
    if (info.sqlState) {
      payload.sqlState = info.sqlState;
    }
    return NextResponse.json(payload, { status: 503 });
  }
}
