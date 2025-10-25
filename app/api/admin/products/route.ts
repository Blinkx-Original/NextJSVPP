import { NextRequest, NextResponse } from 'next/server';
import type { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { safeGetEnv } from '@/lib/env';
import { clearProductCache, getProductRecordBySlug, type RawProductRecord } from '@/lib/products';
import { normalizeProductSlugInput } from '@/lib/product-slug';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type AdminProductErrorCode =
  | 'missing_env'
  | 'missing_slug'
  | 'invalid_slug'
  | 'invalid_payload'
  | 'product_not_found'
  | 'sql_error';

interface AdminProduct {
  slug: string;
  title_h1: string | null;
  short_summary: string | null;
  desc_html: string | null;
  price: string | null;
  cta_lead_url: string | null;
  cta_affiliate_url: string | null;
  cta_stripe_url: string | null;
  cta_paypal_url: string | null;
  primary_image_url: string | null;
  last_tidb_update_at: string | null;
}

interface AdminProductResponseBody {
  ok: true;
  product: AdminProduct;
  rows_affected?: number;
}

interface AdminProductErrorBody {
  ok: false;
  error_code: AdminProductErrorCode;
  message?: string;
  error_details?: unknown;
}

type AdminProductResponse = AdminProductResponseBody | AdminProductErrorBody;

interface UpdatePayload {
  slug?: unknown;
  title_h1?: unknown;
  short_summary?: unknown;
  desc_html?: unknown;
  price?: unknown;
  cta_lead_url?: unknown;
  cta_affiliate_url?: unknown;
  cta_stripe_url?: unknown;
  cta_paypal_url?: unknown;
  image_url?: unknown;
}

const TITLE_MAX_LENGTH = 120;
const SUMMARY_MAX_LENGTH = 200;
const URL_MAX_LENGTH = 2048;
const PRICE_MAX_LENGTH = 120;

function toIsoString(value: Date | string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parsePrimaryImage(value: unknown): string | null {
  if (typeof value !== 'string' || !value) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      return null;
    }
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim().length > 0) {
        return item.trim();
      }
    }
  } catch {
    return null;
  }
  return null;
}

function mapProduct(record: RawProductRecord): AdminProduct {
  const row = record as RawProductRecord &
    RowDataPacket & {
      slug?: string;
      title_h1?: string | null;
      short_summary?: string | null;
      desc_html?: string | null;
      price?: string | null;
      cta_lead_url?: string | null;
      cta_affiliate_url?: string | null;
      cta_stripe_url?: string | null;
      cta_paypal_url?: string | null;
      images_json?: string | null;
      last_tidb_update_at?: Date | string | null;
    };

  return {
    slug: row.slug ?? '',
    title_h1: row.title_h1 ?? null,
    short_summary: row.short_summary ?? null,
    desc_html: row.desc_html ?? null,
    price: row.price ?? null,
    cta_lead_url: row.cta_lead_url ?? null,
    cta_affiliate_url: row.cta_affiliate_url ?? null,
    cta_stripe_url: row.cta_stripe_url ?? null,
    cta_paypal_url: row.cta_paypal_url ?? null,
    primary_image_url: parsePrimaryImage(row.images_json),
    last_tidb_update_at: toIsoString(row.last_tidb_update_at)
  };
}

function normalizeOptionalString(value: unknown, maxLength?: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function normalizeRequiredString(
  value: unknown,
  options: { maxLength?: number; trim?: boolean; allowEmpty?: boolean },
  field: string
): string {
  if (typeof value !== 'string') {
    throw new Error(field);
  }
  let output = options.trim === false ? value : value.trim();
  if (options.maxLength && output.length > options.maxLength) {
    output = output.slice(0, options.maxLength);
  }
  if (!options.allowEmpty && output.length === 0) {
    throw new Error(field);
  }
  return output;
}

function normalizeHtml(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('desc_html');
  }
  return value;
}

async function ensureProductExists(slug: string): Promise<RawProductRecord | null> {
  return getProductRecordBySlug(slug);
}

function buildErrorResponse(
  code: AdminProductErrorCode,
  init?: { status?: number; message?: string; details?: unknown }
): NextResponse<AdminProductResponse> {
  return NextResponse.json(
    {
      ok: false,
      error_code: code,
      message: init?.message,
      error_details: init?.details
    },
    { status: init?.status ?? 400 }
  );
}

export async function GET(request: NextRequest): Promise<NextResponse<AdminProductResponse>> {
  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  const url = new URL(request.url);
  const slugParam = url.searchParams.get('slug') ?? url.searchParams.get('product');
  const normalizedSlug = normalizeProductSlugInput(slugParam);

  if (!slugParam || !normalizedSlug) {
    return buildErrorResponse(slugParam ? 'invalid_slug' : 'missing_slug', {
      status: 400,
      message: 'Provide a valid slug to load the product'
    });
  }

  const record = await ensureProductExists(normalizedSlug);
  if (!record) {
    return buildErrorResponse('product_not_found', { status: 404, message: 'Product not found' });
  }

  const body: AdminProductResponseBody = {
    ok: true,
    product: mapProduct(record)
  };
  return NextResponse.json(body, {
    headers: {
      'Cache-Control': 'no-store, max-age=0'
    }
  });
}

export async function POST(request: NextRequest): Promise<NextResponse<AdminProductResponse>> {
  if (!safeGetEnv()) {
    return buildErrorResponse('missing_env', { status: 500 });
  }

  let payload: UpdatePayload;
  try {
    payload = (await request.json()) as UpdatePayload;
  } catch (error) {
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: 'Invalid JSON payload',
      details: { message: (error as Error)?.message }
    });
  }

  const slugInput = typeof payload.slug === 'string' ? payload.slug : null;
  const normalizedSlug = normalizeProductSlugInput(slugInput);
  if (!normalizedSlug) {
    return buildErrorResponse(slugInput ? 'invalid_slug' : 'missing_slug', {
      status: 400,
      message: 'The slug field is required'
    });
  }

  const existing = await ensureProductExists(normalizedSlug);
  if (!existing) {
    return buildErrorResponse('product_not_found', { status: 404, message: 'Product not found' });
  }

  type ExistingProductRow = RawProductRecord &
    RowDataPacket & {
      title_h1?: string | null;
      short_summary?: string | null;
      desc_html?: string | null;
      price?: string | null;
      cta_lead_url?: string | null;
      cta_affiliate_url?: string | null;
      cta_stripe_url?: string | null;
      cta_paypal_url?: string | null;
      images_json?: string | null;
    };

  const existingRow = existing as ExistingProductRow;

  const existingPrimaryImage = parsePrimaryImage(existingRow.images_json);

  let title: string;
  let summary: string;
  let description: string;
  let price: string;
  let leadUrl: string;
  let affiliateUrl: string;
  let stripeUrl: string;
  let paypalUrl: string;
  let imageUrl: string | null = null;

  try {
    const titleInput =
      typeof payload.title_h1 === 'string' ? payload.title_h1 : existingRow.title_h1 ?? '';
    title = normalizeRequiredString(titleInput, { maxLength: TITLE_MAX_LENGTH }, 'title_h1');

    const summaryInput =
      typeof payload.short_summary === 'string'
        ? payload.short_summary
        : existingRow.short_summary ?? '';
    summary = normalizeRequiredString(
      summaryInput,
      { maxLength: SUMMARY_MAX_LENGTH, allowEmpty: true },
      'short_summary'
    );

    const descriptionInput =
      typeof payload.desc_html === 'string' ? payload.desc_html : existingRow.desc_html ?? '';
    description = normalizeHtml(descriptionInput);

    const priceInput =
      typeof payload.price === 'string'
        ? payload.price
        : typeof existingRow.price === 'string'
          ? existingRow.price
          : '';
    price = normalizeOptionalString(priceInput, PRICE_MAX_LENGTH) ?? '';

    const leadInput =
      typeof payload.cta_lead_url === 'string'
        ? payload.cta_lead_url
        : existingRow.cta_lead_url ?? '';
    leadUrl = normalizeOptionalString(leadInput, URL_MAX_LENGTH) ?? '';

    const affiliateInput =
      typeof payload.cta_affiliate_url === 'string'
        ? payload.cta_affiliate_url
        : existingRow.cta_affiliate_url ?? '';
    affiliateUrl = normalizeOptionalString(affiliateInput, URL_MAX_LENGTH) ?? '';

    const stripeInput =
      typeof payload.cta_stripe_url === 'string'
        ? payload.cta_stripe_url
        : existingRow.cta_stripe_url ?? '';
    stripeUrl = normalizeOptionalString(stripeInput, URL_MAX_LENGTH) ?? '';

    const paypalInput =
      typeof payload.cta_paypal_url === 'string'
        ? payload.cta_paypal_url
        : existingRow.cta_paypal_url ?? '';
    paypalUrl = normalizeOptionalString(paypalInput, URL_MAX_LENGTH) ?? '';

    const imageInput =
      typeof payload.image_url === 'string' ? payload.image_url : existingPrimaryImage ?? '';
    imageUrl = normalizeOptionalString(imageInput, URL_MAX_LENGTH);
  } catch (error) {
    const field = (error as Error)?.message ?? 'invalid_payload';
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message: `Invalid value for ${field}`
    });
  }
  const connection = await getPool().getConnection();
  try {
    const imagesJson = imageUrl ? JSON.stringify([imageUrl]) : JSON.stringify([]);

    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE products
        SET title_h1 = ?,
            short_summary = ?,
            desc_html = ?,
            price = ?,
            cta_lead_url = ?,
            cta_affiliate_url = ?,
            cta_stripe_url = ?,
            cta_paypal_url = ?,
            images_json = ?,
            last_tidb_update_at = NOW(6)
        WHERE slug = ?
        LIMIT 1`,
      [
        title,
        summary,
        description,
        price,
        leadUrl,
        affiliateUrl,
        stripeUrl,
        paypalUrl,
        imagesJson,
        normalizedSlug
      ]
    );

    clearProductCache(normalizedSlug);

    const record = await ensureProductExists(normalizedSlug);
    if (!record) {
      return buildErrorResponse('product_not_found', {
        status: 404,
        message: 'Product not found after update'
      });
    }

    const body: AdminProductResponseBody = {
      ok: true,
      product: mapProduct(record),
      rows_affected: typeof result.affectedRows === 'number' ? result.affectedRows : undefined
    };

    return NextResponse.json(body);
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

