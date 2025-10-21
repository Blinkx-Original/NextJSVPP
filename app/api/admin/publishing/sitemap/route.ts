import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool } from '@/lib/db';
import { clearProductCache } from '@/lib/products';
import { clearSitemapCache } from '@/lib/sitemap-cache';
import { setLastPublishedBatch } from '@/lib/publish-state';
import { acquirePublishingLock, releasePublishingLock } from '@/lib/publishing-lock';
import { recordPublishingActivity } from '@/lib/publishing-activity';
import {
  abbreviateZoneId,
  buildSitemapPurgeList,
  getCloudflareCredentials,
  purgeFiles
} from '@/lib/cloudflare';

export const runtime = 'nodejs';

interface RequestBody {
  batchSize?: number;
}

interface BatchResponseBody {
  ok: boolean;
  requested: number;
  processed: number;
  success: number;
  skipped: number;
  errors: number;
  duration_ms: number;
  finished_at: string;
  message?: string | null;
  slugs?: string[];
  product_paths?: string[];
  sitemap_paths?: string[];
  cloudflare?: {
    configured: boolean;
    ok: boolean;
    error_code?: string | null;
    urls_purged?: number;
    purged?: string[];
    zone_id?: string;
    zone_id_short?: string;
    ray_ids?: string[];
    error_details?: unknown;
  };
  activity_id?: string;
  error_code?: string | null;
  error_details?: unknown;
}

const DEFAULT_BATCH_SIZE = 2000;
const MAX_BATCH_SIZE = 5000;

function parseBatchSize(value: unknown): number {
  const fallback = DEFAULT_BATCH_SIZE;
  if (typeof value !== 'number') {
    return fallback;
  }
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }
  return Math.min(Math.floor(value), MAX_BATCH_SIZE);
}

function normalizeSlug(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function POST(request: NextRequest) {
  if (!acquirePublishingLock('sitemap')) {
    const body: BatchResponseBody = {
      ok: false,
      requested: 0,
      processed: 0,
      success: 0,
      skipped: 0,
      errors: 0,
      duration_ms: 0,
      finished_at: new Date().toISOString(),
      error_code: 'job_in_progress'
    };
    return NextResponse.json(body, { status: 429 });
  }

  const startedAt = Date.now();
  let connection: PoolConnection | null = null;
  let requested = DEFAULT_BATCH_SIZE;
  let processed = 0;
  let success = 0;
  let skipped = 0;
  let errors = 0;
  let slugs: string[] = [];
  let cloudflareSummary: BatchResponseBody['cloudflare'] = { configured: false, ok: false };
  let message: string | null = null;

  try {
    let payload: RequestBody = {};
    try {
      payload = (await request.json()) as RequestBody;
    } catch {
      payload = {};
    }

    requested = parseBatchSize(payload.batchSize);

    connection = await getPool().getConnection();

    const [rows] = await connection.query<RowDataPacket[]>(
      'SELECT id, slug FROM products WHERE is_published = 0 ORDER BY id ASC LIMIT ?',
      [requested]
    );

    const candidates = Array.isArray(rows)
      ? rows
          .map((row) => ({
            id: (row as RowDataPacket & { id?: number | string }).id,
            slug: normalizeSlug((row as RowDataPacket & { slug?: string }).slug)
          }))
          .filter((item): item is { id: number | string; slug: string } =>
            item.id !== undefined && item.slug !== null
          )
      : [];

    if (candidates.length === 0) {
      message = 'No hay productos pendientes de publicación.';
      const duration = Date.now() - startedAt;
      const activity = recordPublishingActivity({
        type: 'sitemap',
        requested,
        processed: 0,
        success: 0,
        skipped: 0,
        errors: 0,
        duration_ms: duration,
        message,
        metadata: { requested }
      });
      const body: BatchResponseBody = {
        ok: true,
        requested,
        processed: 0,
        success: 0,
        skipped: 0,
        errors: 0,
        duration_ms: duration,
        finished_at: activity.finished_at,
        message,
        activity_id: activity.id
      };
      return NextResponse.json(body);
    }

    const ids = candidates.map((item) => item.id);
    slugs = candidates.map((item) => item.slug);
    processed = slugs.length;

    await connection.beginTransaction();
    const [updateResult] = await connection.query<ResultSetHeader>(
      `UPDATE products SET is_published = 1, last_tidb_update_at = NOW() WHERE id IN (${ids
        .map(() => '?')
        .join(',')})`,
      ids
    );
    await connection.commit();

    success = typeof updateResult.affectedRows === 'number' ? updateResult.affectedRows : processed;
    if (success < processed) {
      skipped = processed - success;
    }

    clearSitemapCache();

    const productPaths: string[] = [];
    for (const slug of slugs) {
      clearProductCache(slug);
      const path = `/p/${slug}`;
      productPaths.push(path);
      revalidatePath(path);
    }

    const sitemapPaths = ['/sitemap.xml', '/sitemap_index.xml', '/sitemaps/[sitemap]'];
    for (const path of sitemapPaths) {
      revalidatePath(path);
    }

    setLastPublishedBatch(slugs);

    const credentials = getCloudflareCredentials();
    if (credentials) {
      try {
        const list = await buildSitemapPurgeList(request);
        const purgeResult = await purgeFiles(credentials, list.urls, { label: 'sitemaps' });
        cloudflareSummary = {
          configured: true,
          ok: purgeResult.ok,
          error_code: purgeResult.ok ? null : purgeResult.errorCode ?? 'api_error',
          urls_purged: list.urls.length,
          purged: purgeResult.ok ? list.labels : undefined,
          zone_id: credentials.zoneId,
          zone_id_short: abbreviateZoneId(credentials.zoneId),
          ray_ids: purgeResult.rayIds
        };
      } catch (error) {
        cloudflareSummary = {
          configured: true,
          ok: false,
          error_code: 'purge_failed',
          error_details: error instanceof Error ? { message: error.message } : undefined
        };
      }
    } else {
      cloudflareSummary = { configured: false, ok: false };
    }

    if (cloudflareSummary && cloudflareSummary.configured && !cloudflareSummary.ok) {
      errors = Math.max(errors, 1);
    }

    const duration = Date.now() - startedAt;
    message = `Publicados ${success} productos.`;

    const metadata = {
      requested,
      slugs_total: slugs.length,
      slugs_preview: slugs.slice(0, 20),
      product_paths: productPaths.slice(0, 20),
      sitemap_paths: sitemapPaths,
      cloudflare: cloudflareSummary
    };

    const activity = recordPublishingActivity({
      type: 'sitemap',
      requested,
      processed,
      success,
      skipped,
      errors,
      duration_ms: duration,
      message,
      metadata
    });

    const body: BatchResponseBody = {
      ok: true,
      requested,
      processed,
      success,
      skipped,
      errors,
      duration_ms: duration,
      finished_at: activity.finished_at,
      message,
      slugs,
      product_paths: productPaths,
      sitemap_paths: sitemapPaths,
      cloudflare: cloudflareSummary,
      activity_id: activity.id
    };

    return NextResponse.json(body);
  } catch (error) {
    if (connection) {
      try {
        await connection.rollback();
      } catch {
        // ignore rollback errors
      }
    }
    errors = errors || 1;
    const duration = Date.now() - startedAt;
    const activity = recordPublishingActivity({
      type: 'sitemap',
      requested,
      processed,
      success,
      skipped,
      errors,
      duration_ms: duration,
      message: 'Error ejecutando el batch de sitemap',
      metadata: {
        slugs_total: slugs.length,
        error: error instanceof Error ? { message: error.message } : null
      }
    });
    const body: BatchResponseBody = {
      ok: false,
      requested,
      processed,
      success,
      skipped,
      errors,
      duration_ms: duration,
      finished_at: activity.finished_at,
      message: 'Error ejecutando el batch de sitemap',
      activity_id: activity.id,
      error_code: 'sitemap_batch_failed',
      error_details: error instanceof Error ? { message: error.message } : undefined
    };
    return NextResponse.json(body, { status: 500 });
  } finally {
    connection?.release();
    releasePublishingLock('sitemap');
  }
}
