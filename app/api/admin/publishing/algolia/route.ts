import { NextRequest, NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '@/lib/db';
import { getAlgoliaConfig } from '@/lib/algolia';
import { getPublishedProductsBySlugs } from '@/lib/products';
import { acquirePublishingLock, releasePublishingLock } from '@/lib/publishing-lock';
import { recordPublishingActivity, type PublishingActivityErrorItem } from '@/lib/publishing-activity';

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
  candidate_count?: number;
  activity_id?: string;
  error_code?: string | null;
  error_details?: unknown;
}

interface AlgoliaBatchError extends Error {
  status?: number;
  code?: string;
}

const DEFAULT_BATCH_SIZE = 2000;
const MAX_BATCH_SIZE = 5000;
const CANDIDATE_FACTOR = 4;
const MAX_CANDIDATES = 20000;
const GET_OBJECTS_CHUNK = 1000;
const SAVE_OBJECTS_CHUNK = 500;

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

function chunkArray<T>(input: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < input.length; index += size) {
    chunks.push(input.slice(index, index + size));
  }
  return chunks;
}

async function fetchExistingObjectIds(config: ReturnType<typeof getAlgoliaConfig>, slugs: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  if (!config || slugs.length === 0) {
    return existing;
  }
  const chunks = chunkArray(slugs, GET_OBJECTS_CHUNK);
  for (const chunk of chunks) {
    const response = await fetch(`https://${config.appId}.algolia.net/1/indexes/*/objects`, {
      method: 'POST',
      headers: {
        'X-Algolia-Application-Id': config.appId,
        'X-Algolia-API-Key': config.adminApiKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        requests: chunk.map((objectID) => ({ indexName: config.indexName, objectID }))
      })
    });

    if (!response.ok) {
      const error: AlgoliaBatchError = new Error('algolia_get_objects_failed');
      error.status = response.status;
      error.code = 'algolia_get_failed';
      throw error;
    }

    const body = (await response.json()) as { results?: Array<{ objectID?: string; notFound?: boolean }> };
    const results = Array.isArray(body.results) ? body.results : [];
    for (const result of results) {
      if (result && typeof result.objectID === 'string' && !result.notFound) {
        existing.add(result.objectID);
      }
    }
  }
  return existing;
}

function toAlgoliaObject(record: Awaited<ReturnType<typeof getPublishedProductsBySlugs>>[number]): Record<string, unknown> {
  const raw = record.raw as Record<string, unknown>;
  const slug = record.normalized.slug;
  const idValue = raw.id;
  let productId: string | null = null;
  if (typeof idValue === 'bigint') {
    productId = idValue.toString();
  } else if (typeof idValue === 'number' || typeof idValue === 'string') {
    const text = String(idValue).trim();
    productId = text.length > 0 ? text : null;
  }

  return {
    objectID: slug,
    slug,
    title: record.normalized.title_h1,
    brand: record.normalized.brand || null,
    model: record.normalized.model || null,
    sku: record.normalized.sku || null,
    short_summary: record.normalized.short_summary || null,
    meta_description: record.normalized.meta_description || null,
    images: record.normalized.images,
    desc_html: record.normalized.desc_html || null,
    last_tidb_update_at: record.normalized.last_tidb_update_at,
    product_id: productId,
    cta_lead_url: (raw.cta_lead_url as string | null | undefined) ?? null,
    cta_affiliate_url: (raw.cta_affiliate_url as string | null | undefined) ?? null,
    cta_stripe_url: (raw.cta_stripe_url as string | null | undefined) ?? null,
    cta_paypal_url: (raw.cta_paypal_url as string | null | undefined) ?? null,
    url: `/p/${slug}`,
    is_published: 1
  };
}

async function pushObjectsToAlgolia(
  config: NonNullable<ReturnType<typeof getAlgoliaConfig>>,
  objects: Record<string, unknown>[]
): Promise<void> {
  const chunks = chunkArray(objects, SAVE_OBJECTS_CHUNK);
  for (const chunk of chunks) {
    const response = await fetch(
      `https://${config.appId}.algolia.net/1/indexes/${encodeURIComponent(config.indexName)}/batch`,
      {
        method: 'POST',
        headers: {
          'X-Algolia-Application-Id': config.appId,
          'X-Algolia-API-Key': config.adminApiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          requests: chunk.map((body) => ({ action: 'updateObject', body }))
        })
      }
    );

    if (!response.ok) {
      const text = await response.text();
      const error: AlgoliaBatchError = new Error('algolia_save_objects_failed');
      error.status = response.status;
      error.code = 'algolia_save_failed';
      error.message = text || error.message;
      throw error;
    }
  }
}

export async function POST(request: NextRequest) {
  if (!acquirePublishingLock('algolia')) {
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
  let requested = DEFAULT_BATCH_SIZE;
  let processed = 0;
  let success = 0;
  let skipped = 0;
  let errors = 0;
  let slugs: string[] = [];
  let candidateCount = 0;
  let errorItems: PublishingActivityErrorItem[] = [];

  try {
    const config = getAlgoliaConfig();
    if (!config) {
      const body: BatchResponseBody = {
        ok: false,
        requested: 0,
        processed: 0,
        success: 0,
        skipped: 0,
        errors: 0,
        duration_ms: 0,
        finished_at: new Date().toISOString(),
        error_code: 'missing_env'
      };
      return NextResponse.json(body, { status: 500 });
    }

    let payload: RequestBody = {};
    try {
      payload = (await request.json()) as RequestBody;
    } catch {
      payload = {};
    }

    requested = parseBatchSize(payload.batchSize);
    const candidateLimit = Math.min(requested * CANDIDATE_FACTOR, MAX_CANDIDATES);

    const [rows] = await getPool().query<RowDataPacket[]>(
      `SELECT slug FROM products WHERE is_published = 1 ORDER BY last_tidb_update_at DESC, id DESC LIMIT ?`,
      [candidateLimit]
    );

    const candidateSlugs = Array.isArray(rows)
      ? rows
          .map((row) => normalizeSlug((row as RowDataPacket & { slug?: string }).slug))
          .filter((slug): slug is string => Boolean(slug))
      : [];

    candidateCount = candidateSlugs.length;

    if (candidateSlugs.length === 0) {
      const duration = Date.now() - startedAt;
      const message = 'No hay productos publicados para evaluar.';
      const activity = await recordPublishingActivity({
        type: 'algolia',
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
        candidate_count: candidateCount,
        activity_id: activity.id
      };
      return NextResponse.json(body);
    }

    const existingIds = await fetchExistingObjectIds(config, candidateSlugs);
    const missingSlugs = candidateSlugs.filter((slug) => !existingIds.has(slug)).slice(0, requested);

    if (missingSlugs.length === 0) {
      const duration = Date.now() - startedAt;
      const message = 'No hay pendientes para Algolia.';
      const activity = await recordPublishingActivity({
        type: 'algolia',
        requested,
        processed: 0,
        success: 0,
        skipped: candidateCount,
        errors: 0,
        duration_ms: duration,
        message,
        metadata: { candidate_count: candidateCount }
      });
      const body: BatchResponseBody = {
        ok: true,
        requested,
        processed: 0,
        success: 0,
        skipped: candidateCount,
        errors: 0,
        duration_ms: duration,
        finished_at: activity.finished_at,
        message,
        candidate_count: candidateCount,
        activity_id: activity.id
      };
      return NextResponse.json(body);
    }

    const products = await getPublishedProductsBySlugs(missingSlugs);
    const productMap = new Map<string, (typeof products)[number]>();
    for (const product of products) {
      productMap.set(product.normalized.slug, product);
    }

    const objects: Record<string, unknown>[] = [];
    const resolvedSlugs: string[] = [];
    errorItems = [];

    for (const slug of missingSlugs) {
      const product = productMap.get(slug);
      if (!product) {
        errorItems.push({ slug, message: 'Producto no encontrado o no publicado en TiDB' });
        continue;
      }
      objects.push(toAlgoliaObject(product));
      resolvedSlugs.push(slug);
    }

    if (objects.length === 0) {
      const duration = Date.now() - startedAt;
      errors = errorItems.length > 0 ? errorItems.length : 0;
      const message = 'No se encontraron datos válidos para enviar a Algolia.';
      const activity = await recordPublishingActivity({
        type: 'algolia',
        requested,
        processed: missingSlugs.length,
        success: 0,
        skipped: candidateCount,
        errors,
        duration_ms: duration,
        message,
        metadata: {
          candidate_count: candidateCount,
          missing_slugs: missingSlugs,
          error_items: errorItems
        },
        error_items: errorItems
      });
      const body: BatchResponseBody = {
        ok: false,
        requested,
        processed: missingSlugs.length,
        success: 0,
        skipped: candidateCount,
        errors,
        duration_ms: duration,
        finished_at: activity.finished_at,
        message,
        candidate_count: candidateCount,
        activity_id: activity.id,
        error_code: 'no_valid_products'
      };
      return NextResponse.json(body, { status: 500 });
    }

    await pushObjectsToAlgolia(config, objects);

    processed = missingSlugs.length;
    success = objects.length;
    skipped = candidateCount - missingSlugs.length + (missingSlugs.length - success);
    errors = errorItems.length;
    slugs = resolvedSlugs;

    const duration = Date.now() - startedAt;
    const message = `Empujados ${success} productos a Algolia.`;
    const metadata = {
      candidate_count: candidateCount,
      missing_slugs_total: missingSlugs.length,
      pushed_slugs_total: success,
      slugs_preview: resolvedSlugs.slice(0, 20),
      error_items: errorItems
    };

    const activity = await recordPublishingActivity({
      type: 'algolia',
      requested,
      processed,
      success,
      skipped,
      errors,
      duration_ms: duration,
      message,
      metadata,
      error_items: errorItems
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
      candidate_count: candidateCount,
      activity_id: activity.id
    };

    return NextResponse.json(body);
  } catch (error) {
    errors = Math.max(errors, 1);
    const duration = Date.now() - startedAt;
    const activity = await recordPublishingActivity({
      type: 'algolia',
      requested,
      processed,
      success,
      skipped,
      errors,
      duration_ms: duration,
      message: 'Error ejecutando batch de Algolia',
      metadata: {
        slugs,
        candidate_count: candidateCount,
        error: error instanceof Error ? { message: error.message } : null
      },
      error_items: errorItems
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
      message: 'Error ejecutando batch de Algolia',
      candidate_count: candidateCount,
      activity_id: activity.id,
      error_code: (error as AlgoliaBatchError)?.code ?? 'algolia_batch_failed',
      error_details: error instanceof Error ? { message: error.message } : undefined
    };
    return NextResponse.json(body, { status: 500 });
  } finally {
    releasePublishingLock('algolia');
  }
}
