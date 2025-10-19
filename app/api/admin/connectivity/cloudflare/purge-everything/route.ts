import { NextResponse } from 'next/server';
import {
  abbreviateZoneId,
  getCloudflareCredentials,
  purgeEverything
} from '@/lib/cloudflare';

export const runtime = 'nodejs';

export async function POST() {
  const credentials = getCloudflareCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, error_code: 'missing_env' }, { status: 500 });
  }

  const purgeResult = await purgeEverything(credentials, { label: 'everything' });
  if (purgeResult.ok) {
    return NextResponse.json({
      ok: true,
      latency_ms: purgeResult.duration,
      zone_id: credentials.zoneId,
      zone_id_short: abbreviateZoneId(credentials.zoneId),
      ray_ids: purgeResult.rayIds
    });
  }

  const status = purgeResult.status && purgeResult.status >= 400 ? purgeResult.status : 500;
  return NextResponse.json(
    {
      ok: false,
      error_code: purgeResult.errorCode ?? 'api_error',
      error_details: purgeResult.errorDetails,
      status: purgeResult.status ?? null,
      ray_ids: purgeResult.rayIds
    },
    { status }
  );
}
