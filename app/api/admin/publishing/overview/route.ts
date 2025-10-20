import { NextResponse } from 'next/server';
import type { RowDataPacket } from 'mysql2/promise';
import { getPool } from '@/lib/db';
import { AlgoliaTimeoutError, getAlgoliaConfig, listAlgoliaIndices } from '@/lib/algolia';

export const runtime = 'nodejs';

interface OverviewSiteCounts {
  published: number;
  unpublished: number;
}

interface OverviewAlgoliaInfo {
  configured: boolean;
  indexName: string | null;
  indexCount: number | null;
  errorCode?: string | null;
}

interface OverviewResponseBody {
  ok: boolean;
  site: OverviewSiteCounts;
  algolia: OverviewAlgoliaInfo;
  error_code?: string;
  error_details?: unknown;
}

function parseCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export async function GET() {
  try {
    const pool = getPool();
    const [rows] = await pool.query<RowDataPacket[]>(
      'SELECT\n        SUM(CASE WHEN is_published = 1 THEN 1 ELSE 0 END) AS published,\n        SUM(CASE WHEN is_published = 0 THEN 1 ELSE 0 END) AS unpublished\n      FROM products'
    );

    const publishedRaw = (rows?.[0] as RowDataPacket & { published?: number | string })?.published;
    const unpublishedRaw = (rows?.[0] as RowDataPacket & { unpublished?: number | string })?.unpublished;

    const site: OverviewSiteCounts = {
      published: parseCount(publishedRaw),
      unpublished: parseCount(unpublishedRaw)
    };

    const config = getAlgoliaConfig();
    const algolia: OverviewAlgoliaInfo = {
      configured: Boolean(config),
      indexName: config?.indexName ?? null,
      indexCount: null
    };

    if (config) {
      try {
        const indices = await listAlgoliaIndices(config, { timeoutMs: 10000 });
        const match = indices.items.find((item) => item.name === config.indexName);
        if (match) {
          const entriesRaw = (match as { entries?: number | string }).entries;
          algolia.indexCount = entriesRaw !== undefined ? parseCount(entriesRaw) : null;
        } else {
          algolia.errorCode = 'index_not_found';
        }
      } catch (error) {
        if (error instanceof AlgoliaTimeoutError) {
          algolia.errorCode = 'timeout';
        } else if ((error as Error)?.name === 'AlgoliaAuthError') {
          algolia.errorCode = 'auth_failed';
        } else {
          algolia.errorCode = 'unknown_error';
        }
      }
    }

    const body: OverviewResponseBody = {
      ok: true,
      site,
      algolia
    };

    return NextResponse.json(body);
  } catch (error) {
    const body: OverviewResponseBody = {
      ok: false,
      site: { published: 0, unpublished: 0 },
      algolia: { configured: false, indexName: null, indexCount: null },
      error_code: 'overview_failed',
      error_details: error instanceof Error ? { message: error.message } : undefined
    };
    return NextResponse.json(body, { status: 500 });
  }
}
