import { NextRequest, NextResponse } from 'next/server';
import {
  abbreviateZoneId,
  buildLastBatchProductUrls,
  getCloudflareCredentials,
  purgeFiles
} from '@/lib/cloudflare';
import { ensureSiteUrl } from '@/lib/site-url';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const credentials = getCloudflareCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, error_code: 'missing_env' }, { status: 500 });
  }

  let baseUrl: string;
  try {
    baseUrl = ensureSiteUrl(request);
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error_code: 'missing_env',
        error_details: error instanceof Error ? { message: error.message } : undefined
      },
      { status: 500 }
    );
  }

  const batch = buildLastBatchProductUrls(baseUrl);
  if (batch.urls.length === 0) {
    return NextResponse.json({ ok: false, error_code: 'no_last_batch' }, { status: 404 });
  }

  const purgeResult = await purgeFiles(credentials, batch.urls, { label: 'last-batch' });
  if (purgeResult.ok) {
    return NextResponse.json({
      ok: true,
      latency_ms: purgeResult.duration,
      zone_id: credentials.zoneId,
      zone_id_short: abbreviateZoneId(credentials.zoneId),
      urls_purged: batch.urls.length,
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
