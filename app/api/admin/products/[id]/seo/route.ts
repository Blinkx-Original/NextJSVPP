import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { safeGetEnv } from '@/lib/env';
import { normalizeProductSlugInput } from '@/lib/product-slug';
import { clearProductCache, getProductRecordBySlug } from '@/lib/products';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const MAX_META_LENGTH = 180;
const MAX_SCHEMA_BYTES = 50 * 1024;

interface SeoResponseBody {
  meta_description: string | null;
  schema_json: unknown;
}

interface ErrorBody {
  ok: false;
  error_code:
    | 'missing_env'
    | 'invalid_identifier'
    | 'product_not_found'
    | 'invalid_payload'
    | 'schema_too_large'
    | 'sql_error';
  message?: string;
  error_details?: unknown;
}

interface SuccessBody {
  ok: true;
  data: SeoResponseBody;
  rows_affected?: number;
}

function buildErrorResponse(code: ErrorBody['error_code'], init?: { status?: number; message?: string; details?: unknown }) {
  return NextResponse.json<ErrorBody>(
    {
      ok: false,
      error_code: code,
      message: init?.message,
      error_details: init?.details
    },
    { status: init?.status ?? 400 }
  );
}

function parseSchemaValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    const text = value.toString('utf8').trim();
    if (!text) {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  }
  if (typeof value === 'object') {
    return value;
  }
  return null;
}

function coerceSlug(param: string | undefined): string | null {
  if (!param) {
    return null;
  }
  const decoded = decodeURIComponent(param);
  return normalizeProductSlugInput(decoded);
}

function normalizeMetaDescription(input: string | null): string | null {
  if (input === null) {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > MAX_META_LENGTH) {
    throw new Error('meta_length');
  }
  return trimmed;
}

function encodeSchemaPayload(value: unknown): { json: string | null; size: number } {
  if (value === null) {
    return { json: null, size: 0 };
  }
  const text = JSON.stringify(value);
  const size = Buffer.byteLength(text, 'utf8');
  return { json: text, size };
}

async function readSeo(slug: string): Promise<SeoResponseBody | null> {
  const record = await getProductRecordBySlug(slug);
  if (!record) {
    return null;
  }
  const row = record as RowDataPacket & { meta_description?: string | null; schema_json?: unknown };
  const meta = typeof row.meta_description === 'string' ? row.meta_description : null;
  const schema = parseSchemaValue(row.schema_json ?? null);
  return {
    meta_description: meta,
    schema_json: schema
  };
}

const PayloadSchema = z.object({
  meta_description: z.union([z.string(), z.null()]),
  schema_json: z.union([z.record(z.any()), z.array(z.any()), z.null()])
});

export async function GET(_request: NextRequest, context: { params: { id: string } }) {
  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }
  const slug = coerceSlug(context.params?.id);
  if (!slug) {
    return buildErrorResponse('invalid_identifier', { status: 400, message: 'Invalid product identifier' });
  }
  const data = await readSeo(slug);
  if (!data) {
    return buildErrorResponse('product_not_found', { status: 404, message: 'Product not found' });
  }
  return NextResponse.json<SuccessBody>(
    {
      ok: true,
      data
    },
    {
      headers: {
        'Cache-Control': 'no-store, max-age=0'
      }
    }
  );
}

export async function PUT(request: NextRequest, context: { params: { id: string } }) {
  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }
  const slug = coerceSlug(context.params?.id);
  if (!slug) {
    return buildErrorResponse('invalid_identifier', { status: 400, message: 'Invalid product identifier' });
  }
  const body = await readSeo(slug);
  if (!body) {
    return buildErrorResponse('product_not_found', { status: 404, message: 'Product not found' });
  }

  let payload: z.infer<typeof PayloadSchema>;
  try {
    payload = PayloadSchema.parse(await request.json());
  } catch (error) {
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: 'Invalid JSON payload',
      details: error instanceof Error ? { message: error.message } : undefined
    });
  }

  let meta: string | null;
  try {
    meta = normalizeMetaDescription(payload.meta_description);
  } catch (error) {
    if ((error as Error).message === 'meta_length') {
      return buildErrorResponse('invalid_payload', {
        status: 400,
        message: `La meta description no puede exceder ${MAX_META_LENGTH} caracteres.`
      });
    }
    return buildErrorResponse('invalid_payload', { status: 400, message: 'Invalid meta description' });
  }

  const { json: schemaJson, size } = encodeSchemaPayload(payload.schema_json);
  if (size > MAX_SCHEMA_BYTES) {
    return buildErrorResponse('schema_too_large', {
      status: 400,
      message: `El Schema JSON supera el límite de ${(MAX_SCHEMA_BYTES / 1024).toFixed(0)}KB.`
    });
  }

  const connection = await getPool().getConnection();
  try {
    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE products
        SET meta_description = ?,
            schema_json = ?,
            last_tidb_update_at = NOW(6)
      WHERE slug = ?
      LIMIT 1`,
      [meta, schemaJson, slug]
    );

    clearProductCache(slug);
    revalidatePath(`/p/${slug}`);

    return NextResponse.json<SuccessBody>(
      {
        ok: true,
        data: {
          meta_description: meta,
          schema_json: payload.schema_json
        },
        rows_affected: typeof result.affectedRows === 'number' ? result.affectedRows : undefined
      },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0'
        }
      }
    );
  } catch (error) {
    const info = toDbErrorInfo(error);
    return buildErrorResponse('sql_error', {
      status: 500,
      message: info.message,
      details: info
    });
  } finally {
    connection.release();
  }
}
