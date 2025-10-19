import { NextResponse } from 'next/server';
import {
  abbreviateZoneId,
  getCloudflareCredentials,
  testCloudflareConnection
} from '@/lib/cloudflare';

export const runtime = 'nodejs';

export async function POST() {
  const credentials = getCloudflareCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, error_code: 'missing_env' }, { status: 500 });
  }

  const result = await testCloudflareConnection(credentials);
  if (result.ok) {
    const zoneData = result.body?.result;
    let zoneName: string | null = null;
    if (zoneData && typeof zoneData === 'object' && 'name' in zoneData) {
      const value = (zoneData as Record<string, unknown>).name;
      if (typeof value === 'string') {
        zoneName = value;
      }
    }
    const message = zoneName
      ? `Zona ${zoneName} (${abbreviateZoneId(credentials.zoneId)}) conectada`
      : `Zona ${abbreviateZoneId(credentials.zoneId)} conectada`;
    return NextResponse.json({
      ok: true,
      latency_ms: result.duration,
      zone_id: credentials.zoneId,
      zone_id_short: abbreviateZoneId(credentials.zoneId),
      zone_name: zoneName,
      ray_id: result.rayId ?? null,
      message
    });
  }

  const status = result.status && result.status >= 400 ? result.status : 500;
  return NextResponse.json(
    {
      ok: false,
      error_code: result.errorCode ?? 'api_error',
      error_details: result.body?.errors ?? result.errorDetails,
      status: result.status ?? null,
      ray_id: result.rayId ?? null
    },
    { status }
  );
}
