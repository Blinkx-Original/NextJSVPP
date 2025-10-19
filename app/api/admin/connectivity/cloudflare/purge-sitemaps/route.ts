import { NextRequest, NextResponse } from 'next/server';
import {
  abbreviateZoneId,
  buildSitemapPurgeList,
  getCloudflareCredentials,
  purgeFiles
} from '@/lib/cloudflare';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const credentials = getCloudflareCredentials();
  if (!credentials) {
    return NextResponse.json({ ok: false, error_code: 'missing_env' }, { status: 500 });
  }

  let list;
  try {
    list = await buildSitemapPurgeList(request);
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

  const purgeResult = await purgeFiles(credentials, list.urls, { label: 'sitemaps' });
  if (purgeResult.ok) {
    const message = `Purgados: ${list.labels.join(', ')}`;
    return NextResponse.json({
      ok: true,
      latency_ms: purgeResult.duration,
      zone_id: credentials.zoneId,
      zone_id_short: abbreviateZoneId(credentials.zoneId),
      purged: list.labels,
      urls_purged: list.urls.length,
      ray_ids: purgeResult.rayIds,
      base_url: list.baseUrl,
      message
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
