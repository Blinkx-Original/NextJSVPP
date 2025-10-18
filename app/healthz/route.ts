import { NextResponse } from 'next/server';
import { pingDatabase } from '@/lib/db';

export const runtime = 'edge';

export async function GET() {
  const dbUp = await pingDatabase();
  const version = process.env.VERCEL_GIT_COMMIT_SHA ?? process.env.GIT_COMMIT_SHA ?? 'dev';
  return NextResponse.json({ ok: dbUp, db: dbUp ? 'up' : 'down', version }, { status: dbUp ? 200 : 503 });
}
