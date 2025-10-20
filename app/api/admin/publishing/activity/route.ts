import { NextResponse } from 'next/server';
import { getPublishingActivity } from '@/lib/publishing-activity';

export const runtime = 'nodejs';

export async function GET() {
  const entries = getPublishingActivity();
  return NextResponse.json({ ok: true, entries });
}
