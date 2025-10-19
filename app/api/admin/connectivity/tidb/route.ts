import { NextResponse } from 'next/server';
import type { PoolConnection, RowDataPacket } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { safeGetEnv } from '@/lib/env';

export const runtime = 'nodejs';

interface TidbResponse {
  ok: boolean;
  latency_ms?: number;
  published?: number;
  lastmod?: string | null;
  error_code?: 'missing_env' | 'auth_failed' | 'sql_error' | 'timeout';
  error_details?: unknown;
}

function mapTidbError(error: unknown): Pick<TidbResponse, 'error_code' | 'error_details'> {
  if (!error || typeof error !== 'object') {
    return { error_code: 'sql_error' };
  }

  const record = error as Record<string, unknown>;
  const code = typeof record.code === 'string' ? record.code : undefined;

  if (code === 'ER_ACCESS_DENIED_ERROR' || code === 'ER_DBACCESS_DENIED_ERROR') {
    return { error_code: 'auth_failed' };
  }

  if (code === 'ETIMEDOUT' || code === 'PROTOCOL_SEQUENCE_TIMEOUT' || code === 'PROTOCOL_CONNECTION_LOST') {
    return { error_code: 'timeout' };
  }

  const info = toDbErrorInfo(error);
  return { error_code: 'sql_error', error_details: info };
}

async function runQuery<T extends RowDataPacket[]>(
  connection: PoolConnection,
  sql: string
): Promise<T> {
  const [rows] = await connection.query<T>(sql);
  return rows;
}

export async function POST() {
  const startedAt = Date.now();

  if (!safeGetEnv()) {
    const body: TidbResponse = { ok: false, error_code: 'missing_env' };
    return NextResponse.json(body, { status: 500 });
  }

  let connection: PoolConnection | null = null;

  try {
    connection = await getPool().getConnection();

    await runQuery(connection, 'SELECT 1');

    const publishedRows = await runQuery<RowDataPacket[]>(
      connection,
      'SELECT COUNT(*) AS published FROM products WHERE is_published = 1'
    );
    const lastmodRows = await runQuery<RowDataPacket[]>(
      connection,
      'SELECT MAX(last_tidb_update_at) AS lastmod FROM products'
    );

    const publishedValueRaw = (publishedRows[0] as RowDataPacket & {
      published?: number | string;
    })?.published;
    const publishedValue =
      typeof publishedValueRaw === 'number' ? publishedValueRaw : Number(publishedValueRaw ?? 0);

    const lastmodRaw = (lastmodRows[0] as RowDataPacket & { lastmod?: Date | string | null })?.lastmod ?? null;
    const lastmodIso = (() => {
      if (lastmodRaw instanceof Date) {
        return lastmodRaw.toISOString();
      }
      if (typeof lastmodRaw === 'string') {
        const parsed = new Date(lastmodRaw);
        return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
      return null;
    })();
    const latency = Date.now() - startedAt;

    const body: TidbResponse = {
      ok: true,
      latency_ms: latency,
      published: Number.isFinite(publishedValue) ? publishedValue : 0,
      lastmod: lastmodIso
    };

    return NextResponse.json(body);
  } catch (error) {
    const mapped = mapTidbError(error);
    const body: TidbResponse = {
      ok: false,
      error_code: mapped.error_code ?? 'sql_error',
      error_details: mapped.error_details
    };
    return NextResponse.json(body, { status: 500 });
  } finally {
    connection?.release();
  }
}
