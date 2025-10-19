import { NextResponse } from 'next/server';
import { abbreviateZoneId, readCloudflareEnv } from '@/lib/cloudflare';

export const runtime = 'nodejs';

export async function GET() {
  const env = readCloudflareEnv();
  const zoneId = env.zoneId ?? null;
  const apiToken = env.apiToken ?? null;
  const zoneIdShort = zoneId ? abbreviateZoneId(zoneId) : null;
  const body = {
    ok: true,
    configured: Boolean(zoneId && apiToken),
    zone_id: zoneId,
    zone_id_short: zoneIdShort
  };
  return NextResponse.json(body);
}
