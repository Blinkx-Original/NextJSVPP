import { NextResponse } from 'next/server';
import { getAlgoliaConfig, listAlgoliaIndices, AlgoliaTimeoutError } from '@/lib/algolia';

export const runtime = 'nodejs';

interface AlgoliaResponse {
  ok: boolean;
  latency_ms?: number;
  index_exists?: boolean;
  index?: string;
  error_code?: 'missing_env' | 'auth_failed' | 'index_not_found' | 'timeout';
  error_details?: unknown;
}

export async function POST() {
  const startedAt = Date.now();
  const config = getAlgoliaConfig();

  if (!config) {
    const body: AlgoliaResponse = { ok: false, error_code: 'missing_env' };
    return NextResponse.json(body, { status: 500 });
  }

  try {
    const indices = await listAlgoliaIndices(config, { timeoutMs: 10000 });
    const exists = indices.items.some((item) => item.name === config.indexName);

    if (!exists) {
      const body: AlgoliaResponse = {
        ok: false,
        error_code: 'index_not_found',
        index_exists: false,
        index: config.indexName
      };
      return NextResponse.json(body, { status: 404 });
    }

    const latency = Date.now() - startedAt;
    const body: AlgoliaResponse = {
      ok: true,
      latency_ms: latency,
      index_exists: true,
      index: config.indexName
    };
    return NextResponse.json(body);
  } catch (error) {
    if (error instanceof AlgoliaTimeoutError) {
      const errorBody: AlgoliaResponse = { ok: false, error_code: 'timeout' };
      return NextResponse.json(errorBody, { status: 504 });
    }

    if ((error as Error)?.name === 'AlgoliaAuthError') {
      const errorBody: AlgoliaResponse = { ok: false, error_code: 'auth_failed' };
      return NextResponse.json(errorBody, { status: 401 });
    }

    const errorBody: AlgoliaResponse = {
      ok: false,
      error_code: 'index_not_found',
      index_exists: false,
      index: config.indexName,
      error_details: { message: (error as Error)?.message }
    };

    return NextResponse.json(errorBody, { status: 502 });
  }
}
