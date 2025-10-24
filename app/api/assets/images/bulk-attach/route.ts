import { NextResponse } from 'next/server';
import type { ResultSetHeader } from 'mysql2/promise';
import { requireAdminAuth } from '@/lib/basic-auth';
import {
  buildDeliveryUrl,
  getCloudflareImagesCredentials,
  readCloudflareImagesConfig
} from '@/lib/cloudflare-images';
import { getPool } from '@/lib/db';
import {
  appendImageEntry,
  getProductForImages,
  inferCloudflareImageDetails,
  normalizeImages,
  parseImagesJson,
  toImagesJsonString
} from '@/lib/product-images';
import type { BasicProductImageInfo, ParsedImagesJson } from '@/lib/product-images';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

interface BulkAttachSuccessResponse {
  ok: true;
  results: Array<{
    slug: string;
    status: 'attached' | 'skipped' | 'error';
    detail?: string;
  }>;
  total: number;
  attached: number;
  skipped: number;
  errors: number;
}

interface BulkAttachErrorResponse {
  ok: false;
  error_code:
    | 'invalid_form'
    | 'parse_error'
    | 'cf_images_disabled'
    | 'missing_credentials'
    | 'missing_base_url';
  message?: string;
}

const MAX_ROWS = 100;

type CsvRow = string[];

function parseCsv(text: string): CsvRow[] {
  const rows: CsvRow[] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (inQuotes) {
      if (char === '"') {
        const next = text[index + 1];
        if (next === '"') {
          current += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ',') {
      row.push(current);
      current = '';
      continue;
    }

    if (char === '\r') {
      continue;
    }

    if (char === '\n') {
      row.push(current);
      rows.push(row);
      row = [];
      current = '';
      continue;
    }

    current += char;
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  return rows.map((columns) => columns.map((value) => value.trim()));
}

export async function POST(request: Request) {
  const auth = requireAdminAuth(request);
  if (!auth.ok) {
    return auth.response!;
  }

  const config = readCloudflareImagesConfig();
  if (!config.enabled) {
    return NextResponse.json<BulkAttachErrorResponse>(
      { ok: false, error_code: 'cf_images_disabled', message: 'Cloudflare Images no está habilitado' },
      { status: 503 }
    );
  }

  if (!getCloudflareImagesCredentials(config)) {
    return NextResponse.json<BulkAttachErrorResponse>(
      { ok: false, error_code: 'missing_credentials', message: 'Faltan credenciales de Cloudflare Images' },
      { status: 500 }
    );
  }

  if (!config.baseUrl) {
    return NextResponse.json<BulkAttachErrorResponse>(
      { ok: false, error_code: 'missing_base_url', message: 'CF_IMAGES_BASE_URL no está configurado' },
      { status: 500 }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json<BulkAttachErrorResponse>(
      { ok: false, error_code: 'invalid_form', message: 'CSV requerido' },
      { status: 400 }
    );
  }

  const text = await file.text();
  const parsedRows = parseCsv(text).filter((row) => row.some((value) => value && value.length > 0));

  if (parsedRows.length === 0) {
    return NextResponse.json<BulkAttachErrorResponse>(
      { ok: false, error_code: 'parse_error', message: 'CSV vacío' },
      { status: 400 }
    );
  }

  let rows = parsedRows;
  const header = parsedRows[0];
  if (header && header[0] && header[0].toLowerCase() === 'slug') {
    rows = parsedRows.slice(1);
  }

  rows = rows.filter((row) => row.some((value) => value && value.length > 0));

  if (rows.length === 0) {
    return NextResponse.json<BulkAttachErrorResponse>(
      { ok: false, error_code: 'parse_error', message: 'No se encontraron filas válidas' },
      { status: 400 }
    );
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json<BulkAttachErrorResponse>(
      { ok: false, error_code: 'invalid_form', message: 'Máximo 100 filas por carga' },
      { status: 400 }
    );
  }

  interface ProductContext {
    product: BasicProductImageInfo;
    parsed: ParsedImagesJson;
    urls: Set<string>;
    updated: boolean;
    attached: number;
  }

  const contexts = new Map<string, ProductContext>();
  const aliases = new Map<string, ProductContext>();
  const results: BulkAttachSuccessResponse['results'] = [];
  let attached = 0;
  let skipped = 0;
  let errors = 0;

  for (const row of rows) {
    const slugValue = (row[0] ?? '').trim();
    const value = (row[1] ?? '').trim();

    if (!slugValue) {
      errors += 1;
      results.push({ slug: '', status: 'error', detail: 'Slug requerido' });
      continue;
    }

    if (!value) {
      errors += 1;
      results.push({ slug: slugValue, status: 'error', detail: 'cf_image_id o URL requerido' });
      continue;
    }

    const inputKey = slugValue.toLowerCase();
    let context = contexts.get(inputKey) ?? aliases.get(inputKey);

    if (!context) {
      const product = await getProductForImages({ slug: slugValue, id: slugValue });
      if (!product) {
        errors += 1;
        results.push({ slug: slugValue, status: 'error', detail: 'Producto no encontrado' });
        continue;
      }

      const parsed = parseImagesJson(product.imagesJson);
      const normalized = normalizeImages(parsed, config.baseUrl);
      context = {
        product,
        parsed,
        urls: new Set(normalized.map((entry) => entry.url)),
        updated: false,
        attached: 0
      };
      const productKey = (product.slug || slugValue).toLowerCase();
      const existing = contexts.get(productKey);
      if (existing) {
        context = existing;
      } else {
        contexts.set(productKey, context);
      }
      aliases.set(inputKey, context);
      aliases.set(productKey, context);
    }

    let imageId: string | null = null;
    let variant = 'public';
    let deliveryUrl: string | null = null;

    if (value.includes('://')) {
      deliveryUrl = value;
      const details = inferCloudflareImageDetails(value, config.baseUrl);
      if (details.imageId) {
        imageId = details.imageId;
      }
      if (details.variant) {
        variant = details.variant;
      }
    } else {
      imageId = value;
      deliveryUrl = buildDeliveryUrl(config.baseUrl, value, variant);
    }

    if (!deliveryUrl) {
      errors += 1;
      results.push({ slug: context.product.slug, status: 'error', detail: 'No se pudo construir la URL de entrega' });
      continue;
    }

    if (context.urls.has(deliveryUrl)) {
      skipped += 1;
      results.push({ slug: context.product.slug, status: 'skipped', detail: 'URL duplicada' });
      continue;
    }

    context.parsed = appendImageEntry(context.parsed, deliveryUrl, { imageId, variant });
    context.urls.add(deliveryUrl);
    context.updated = true;
    context.attached += 1;
    attached += 1;
    results.push({ slug: context.product.slug, status: 'attached', detail: imageId ?? deliveryUrl });
  }

  const processed = new Set<ProductContext>();
  for (const context of contexts.values()) {
    if (processed.has(context)) {
      continue;
    }
    processed.add(context);
    if (!context.updated) {
      continue;
    }

    const serialized = toImagesJsonString(context.parsed);
    try {
      const [result] = await getPool().query<ResultSetHeader>(
        `UPDATE products SET images_json = ?, last_tidb_update_at = NOW(6) WHERE ${
          context.product.slug ? 'slug' : 'id'
        } = ? LIMIT 1`,
        [serialized, context.product.slug || context.product.id]
      );

      console.log('[cf-images][bulk-attach] success', {
        slug: context.product.slug,
        attached: context.attached,
        rows_affected: typeof result.affectedRows === 'number' ? result.affectedRows : null
      });
    } catch (error) {
      errors += 1;
      console.error('[cf-images][bulk-attach] database_error', {
        slug: context.product.slug,
        message: error instanceof Error ? error.message : String(error)
      });
      results.push({ slug: context.product.slug, status: 'error', detail: 'Error actualizando TiDB' });
    }
  }

  return NextResponse.json<BulkAttachSuccessResponse>({
    ok: true,
    results,
    total: results.length,
    attached,
    skipped,
    errors
  });
}
