import { NextResponse } from 'next/server';
import { getPublishingActivity } from '@/lib/publishing-activity';

export const runtime = 'nodejs';

export async function GET() {
  const entries = await getPublishingActivity();
  return NextResponse.json({ ok: true, entries });
}
