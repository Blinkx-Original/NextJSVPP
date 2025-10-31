import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from '@/lib/db';
import { safeGetEnv } from '@/lib/env';
import { clearProductCache, getProductRecordBySlug, type RawProductRecord } from '@/lib/products';
import { getCategoryTypeSynonyms, getProductCategoryColumns } from '@/lib/categories';
import { slugifyCategoryName } from '@/lib/category-slug';
import { normalizeProductSlugInput } from '@/lib/product-slug';
import { DESCRIPTION_MAX_LENGTH, sanitizeProductHtml } from '@/lib/sanitize-html';

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
  category: string | null;
  cta_lead_url: string | null;
  cta_affiliate_url: string | null;
  cta_stripe_url: string | null;
  cta_paypal_url: string | null;
  cta_lead_label: string | null;
  cta_affiliate_label: string | null;
  cta_stripe_label: string | null;
  cta_paypal_label: string | null;
  brand: string | null;
  model: string | null;
  sku: string | null;
  images: string[];
  primary_image_url: string | null;
  meta_description: string | null;
  schema_json: string | null;
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
  category?: unknown;
  cta_lead_url?: unknown;
  cta_affiliate_url?: unknown;
  cta_stripe_url?: unknown;
  cta_paypal_url?: unknown;
  cta_lead_label?: unknown;
  cta_affiliate_label?: unknown;
  cta_stripe_label?: unknown;
  cta_paypal_label?: unknown;
  image_url?: unknown;
}

const TITLE_MAX_LENGTH = 120;
const SUMMARY_MAX_LENGTH = 200;
const URL_MAX_LENGTH = 2048;
const PRICE_MAX_LENGTH = 120;
const CTA_LABEL_MAX_LENGTH = 80;
const CATEGORY_MAX_LENGTH = 120;
const CATEGORY_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

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

function parseImagesField(value: unknown): string[] {
  if (typeof value !== 'string' || !value.trim()) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.trim());
    }
  } catch {
    return [];
  }
  return [];
}

function getPrimaryImage(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const images = parseImagesField(value);
  return images[0] ?? null;
}

function normalizeSchemaField(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(value)) {
    const text = value.toString('utf8').trim();
    return text.length > 0 ? text : null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function mapProduct(record: RawProductRecord): AdminProduct {
  const row = record as RawProductRecord &
    RowDataPacket & {
      slug?: string;
      title_h1?: string | null;
      short_summary?: string | null;
      desc_html?: string | null;
      price?: string | null;
      category?: string | null;
      cta_lead_url?: string | null;
      cta_affiliate_url?: string | null;
      cta_stripe_url?: string | null;
      cta_paypal_url?: string | null;
      cta_lead_label?: string | null;
      cta_affiliate_label?: string | null;
      cta_stripe_label?: string | null;
      cta_paypal_label?: string | null;
      images_json?: string | null;
      brand?: string | null;
      model?: string | null;
      sku?: string | null;
      meta_description?: string | null;
      schema_json?: unknown;
      last_tidb_update_at?: Date | string | null;
    };

  const images = parseImagesField(row.images_json);

  return {
    slug: row.slug ?? '',
    title_h1: row.title_h1 ?? null,
    short_summary: row.short_summary ?? null,
    desc_html: row.desc_html ?? null,
    price: row.price ?? null,
    category: row.category ?? null,
    cta_lead_url: row.cta_lead_url ?? null,
    cta_affiliate_url: row.cta_affiliate_url ?? null,
    cta_stripe_url: row.cta_stripe_url ?? null,
    cta_paypal_url: row.cta_paypal_url ?? null,
    cta_lead_label: row.cta_lead_label ?? null,
    cta_affiliate_label: row.cta_affiliate_label ?? null,
    cta_stripe_label: row.cta_stripe_label ?? null,
    cta_paypal_label: row.cta_paypal_label ?? null,
    brand: row.brand ?? null,
    model: row.model ?? null,
    sku: row.sku ?? null,
    images,
    primary_image_url: images[0] ?? null,
    meta_description: row.meta_description ?? null,
    schema_json: normalizeSchemaField(row.schema_json),
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

function normalizeOptionalUrl(value: unknown, field: string, maxLength?: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    throw new Error(field);
  }
  if (maxLength && trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

function toIdString(value: unknown): string | null {
  if (typeof value === 'bigint') {
    return value.toString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (value && typeof value === 'object' && 'toString' in value) {
    const text = String(value).trim();
    return text.length > 0 ? text : null;
  }
  return null;
}

function normalizeOptionalLabel(value: unknown, maxLength: number): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

async function syncProductCategoryColumns(
  connection: PoolConnection,
  slug: string,
  categoryValue: string | null
): Promise<void> {
  const columns = await getProductCategoryColumns(connection);
  if (!Array.isArray(columns) || columns.length === 0) {
    return;
  }

  const normalizedCategory = typeof categoryValue === 'string' ? categoryValue.trim().toLowerCase() : null;

  for (const column of columns) {
    if (column === 'category' || column === 'categoria') {
      continue;
    }
    if (!column.includes('slug')) {
      continue;
    }
    if (normalizedCategory) {
      await connection.query(`UPDATE products SET \`${column}\` = ? WHERE slug = ?`, [normalizedCategory, slug]);
    } else {
      await connection.query(`UPDATE products SET \`${column}\` = NULL WHERE slug = ?`, [slug]);
    }
  }
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
  const sanitized = sanitizeProductHtml(value);
  if (sanitized.length > DESCRIPTION_MAX_LENGTH) {
    throw new Error('desc_html_length');
  }
  return sanitized;
}

async function ensureProductExists(slug: string): Promise<RawProductRecord | null> {
  return getProductRecordBySlug(slug);
}

const TEXTUAL_PRICE_TYPES = new Set(['varchar', 'char', 'text', 'tinytext', 'mediumtext', 'longtext']);

let priceColumnCheckPromise: Promise<void> | null = null;

async function ensurePriceColumnAllowsText(connection: PoolConnection): Promise<void> {
  if (priceColumnCheckPromise) {
    return priceColumnCheckPromise;
  }

  priceColumnCheckPromise = (async () => {
    try {
      const [rows] = await connection.query<RowDataPacket[]>(
        `SELECT DATA_TYPE, COLUMN_TYPE
           FROM information_schema.COLUMNS
          WHERE TABLE_SCHEMA = DATABASE()
            AND TABLE_NAME = 'products'
            AND COLUMN_NAME = 'price'
          LIMIT 1`
      );

      if (!Array.isArray(rows) || rows.length === 0) {
        return;
      }

      const row = rows[0] ?? {};
      const dataType = String((row as Record<string, unknown>).DATA_TYPE ?? (row as Record<string, unknown>).data_type ?? '')
        .trim()
        .toLowerCase();

      if (TEXTUAL_PRICE_TYPES.has(dataType)) {
        return;
      }

      await connection.query(
        `ALTER TABLE products
           MODIFY COLUMN price VARCHAR(120)
           CHARACTER SET utf8mb4
           COLLATE utf8mb4_unicode_ci
           NULL DEFAULT NULL`
      );
    } catch (error) {
      priceColumnCheckPromise = null;
      throw error;
    }
  })();

  return priceColumnCheckPromise;
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
      category?: string | null;
      cta_lead_url?: string | null;
      cta_affiliate_url?: string | null;
      cta_stripe_url?: string | null;
      cta_paypal_url?: string | null;
      cta_lead_label?: string | null;
      cta_affiliate_label?: string | null;
      cta_stripe_label?: string | null;
      cta_paypal_label?: string | null;
      images_json?: string | null;
    };

  const existingRow = existing as ExistingProductRow;

  const existingPrimaryImage = getPrimaryImage(existingRow.images_json);
  const previousCategory = normalizeOptionalString(existingRow.category ?? '', CATEGORY_MAX_LENGTH);

  let title: string;
  let summary: string;
  let description: string;
  let price: string;
  let leadUrl: string;
  let affiliateUrl: string;
  let stripeUrl: string;
  let paypalUrl: string;
  let leadLabel: string;
  let affiliateLabel: string;
  let stripeLabel: string;
  let paypalLabel: string;
  let imageUrl: string | null = null;
  let categoryValue: string | null = previousCategory;

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
    leadUrl = normalizeOptionalUrl(leadInput, 'cta_lead_url', URL_MAX_LENGTH) ?? '';

    const affiliateInput =
      typeof payload.cta_affiliate_url === 'string'
        ? payload.cta_affiliate_url
        : existingRow.cta_affiliate_url ?? '';
    affiliateUrl = normalizeOptionalUrl(affiliateInput, 'cta_affiliate_url', URL_MAX_LENGTH) ?? '';

    const stripeInput =
      typeof payload.cta_stripe_url === 'string'
        ? payload.cta_stripe_url
        : existingRow.cta_stripe_url ?? '';
    stripeUrl = normalizeOptionalUrl(stripeInput, 'cta_stripe_url', URL_MAX_LENGTH) ?? '';

    const paypalInput =
      typeof payload.cta_paypal_url === 'string'
        ? payload.cta_paypal_url
        : existingRow.cta_paypal_url ?? '';
    paypalUrl = normalizeOptionalUrl(paypalInput, 'cta_paypal_url', URL_MAX_LENGTH) ?? '';

    const leadLabelInput =
      typeof payload.cta_lead_label === 'string'
        ? payload.cta_lead_label
        : existingRow.cta_lead_label ?? '';
    leadLabel = normalizeOptionalLabel(leadLabelInput, CTA_LABEL_MAX_LENGTH);

    const affiliateLabelInput =
      typeof payload.cta_affiliate_label === 'string'
        ? payload.cta_affiliate_label
        : existingRow.cta_affiliate_label ?? '';
    affiliateLabel = normalizeOptionalLabel(affiliateLabelInput, CTA_LABEL_MAX_LENGTH);

    const stripeLabelInput =
      typeof payload.cta_stripe_label === 'string'
        ? payload.cta_stripe_label
        : existingRow.cta_stripe_label ?? '';
    stripeLabel = normalizeOptionalLabel(stripeLabelInput, CTA_LABEL_MAX_LENGTH);

    const paypalLabelInput =
      typeof payload.cta_paypal_label === 'string'
        ? payload.cta_paypal_label
        : existingRow.cta_paypal_label ?? '';
    paypalLabel = normalizeOptionalLabel(paypalLabelInput, CTA_LABEL_MAX_LENGTH);

    const imageInput =
      typeof payload.image_url === 'string' ? payload.image_url : existingPrimaryImage ?? '';
    imageUrl = normalizeOptionalString(imageInput, URL_MAX_LENGTH);

    if (payload.category === null) {
      categoryValue = null;
    } else if (typeof payload.category === 'string') {
      categoryValue = normalizeOptionalString(payload.category, CATEGORY_MAX_LENGTH);
    } else if (typeof existingRow.category === 'string') {
      categoryValue = normalizeOptionalString(existingRow.category, CATEGORY_MAX_LENGTH);
    } else {
      categoryValue = null;
    }

    if (categoryValue) {
      const normalizedCategory = categoryValue.trim().toLowerCase();
      if (CATEGORY_SLUG_REGEX.test(normalizedCategory)) {
        categoryValue = normalizedCategory;
      } else {
        const slugified = slugifyCategoryName(categoryValue);
        const cleaned = slugified.trim().toLowerCase();
        categoryValue = CATEGORY_SLUG_REGEX.test(cleaned)
          ? cleaned
          : normalizedCategory.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
      }

      if (!categoryValue) {
        categoryValue = null;
      }
    }
  } catch (error) {
    const field = (error as Error)?.message ?? 'invalid_payload';
    let message = `Invalid value for ${field}`;
    if (field === 'desc_html_length') {
      message = `La descripción supera el máximo de ${DESCRIPTION_MAX_LENGTH.toLocaleString()} caracteres permitidos.`;
    } else if (field === 'desc_html') {
      message = 'La descripción enviada no es válida.';
    }
    return buildErrorResponse('invalid_payload', {
      status: 400,
      message
    });
  }
  const connection = await getPool().getConnection();
  try {
    await ensurePriceColumnAllowsText(connection);

    const imagesJson = imageUrl ? JSON.stringify([imageUrl]) : JSON.stringify([]);

    const [result] = await connection.query<ResultSetHeader>(
      `UPDATE products
        SET title_h1 = ?,
            short_summary = ?,
            desc_html = ?,
            price = ?,
            category = ?,
            cta_lead_url = ?,
            cta_affiliate_url = ?,
            cta_stripe_url = ?,
            cta_paypal_url = ?,
            cta_lead_label = ?,
            cta_affiliate_label = ?,
            cta_stripe_label = ?,
            cta_paypal_label = ?,
            images_json = ?,
            last_tidb_update_at = NOW(6)
        WHERE slug = ?
        LIMIT 1`,
      [
        title,
        summary,
        description,
        price,
        categoryValue,
        leadUrl,
        affiliateUrl,
        stripeUrl,
        paypalUrl,
        leadLabel,
        affiliateLabel,
        stripeLabel,
        paypalLabel,
        imagesJson,
        normalizedSlug
      ]
    );

    await syncProductCategoryColumns(connection, normalizedSlug, categoryValue);

    clearProductCache(normalizedSlug);
    revalidatePath(`/p/${normalizedSlug}`);

    if (previousCategory && previousCategory !== categoryValue && CATEGORY_SLUG_REGEX.test(previousCategory)) {
      revalidatePath(`/c/${previousCategory}`);
    }
    if (categoryValue && categoryValue !== previousCategory && CATEGORY_SLUG_REGEX.test(categoryValue)) {
      revalidatePath(`/c/${categoryValue}`);
    }

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

