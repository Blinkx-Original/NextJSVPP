import he from 'he';
import { z } from 'zod';
import { getPool, toDbErrorInfo } from './db';

const DEFAULT_SITEMAP_LIMIT = 45000;

const bigintLike = z.union([z.bigint(), z.number(), z.string()]);

const productSchema = z.object({
  id: bigintLike,
  slug: z.string(),
  title_h1: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  sku: z.string().nullable(),
  short_summary: z.string().nullable(),
  meta_description: z.string().nullable(),
  images_json: z.string().nullable(),
  desc_html: z.string().nullable(),
  cta_lead_url: z.string().nullable(),
  cta_stripe_url: z.string().nullable(),
  cta_affiliate_url: z.string().nullable(),
  cta_paypal_url: z.string().nullable(),
  price: z.string().nullable(),
  is_published: z.number().or(z.boolean()),
  last_tidb_update_at: z.string().nullable(),
  updated_at: z.string().nullable().optional()
});

export type ProductRecord = z.infer<typeof productSchema>;

export type RawProductRecord = Record<string, any>;

export interface NormalizedProduct {
  title_h1: string;
  brand: string;
  model: string;
  sku: string;
  images: string[];
  desc_html: string;
  short_summary: string;
  meta_description: string;
  slug: string;
  price: string;
  cta_lead_url: string;
  cta_affiliate_url: string;
  cta_stripe_url: string;
  cta_paypal_url: string;
  last_tidb_update_at: string | null;
}

export interface NormalizedProductResult {
  raw: RawProductRecord;
  normalized: NormalizedProduct;
}

const PRODUCT_CACHE_TTL_MS = 5 * 60 * 1000;

interface CachedProductEntry {
  value: NormalizedProductResult;
  expiresAt: number;
}

const productCache = new Map<string, CachedProductEntry>();

function cacheLabel(requestId?: string): string {
  return requestId ? ` [${requestId}]` : '';
}

function readProductCache(slug: string, requestId?: string): NormalizedProductResult | null {
  const entry = productCache.get(slug);
  if (!entry) {
    console.log(`[isr-cache][product] slug=${slug} MISS${cacheLabel(requestId)}`);
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    productCache.delete(slug);
    console.log(`[isr-cache][product] slug=${slug} EXPIRED${cacheLabel(requestId)}`);
    return null;
  }
  console.log(`[isr-cache][product] slug=${slug} HIT${cacheLabel(requestId)}`);
  return entry.value;
}

function writeProductCache(slug: string, value: NormalizedProductResult): void {
  productCache.set(slug, { value, expiresAt: Date.now() + PRODUCT_CACHE_TTL_MS });
}

export function clearProductCache(slug?: string): void {
  if (typeof slug === 'string') {
    productCache.delete(slug);
  } else {
    productCache.clear();
  }
}

export interface Product {
  id: bigint;
  slug: string;
  title: string;
  brand?: string | null;
  model?: string | null;
  sku?: string | null;
  shortSummary?: string | null;
  images: string[];
  descriptionHtml?: string | null;
  ctas: {
    lead?: string | null;
    affiliate?: string | null;
    stripe?: string | null;
    paypal?: string | null;
  };
  price?: string | null;
  lastUpdatedAt?: string | null;
}

function parseImages(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item) => typeof item === 'string' && item.length > 0);
    }
  } catch (error) {
    console.warn('[products] unable to parse images_json', error);
  }
  return [];
}

function toCleanString(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.toLowerCase() === 'null' || trimmed.toLowerCase() === 'undefined') {
      return '';
    }
    return trimmed;
  }
  return String(value).trim();
}

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

function tryParseJson(text: string): unknown | null {
  if (!looksLikeJson(text)) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function isJsonLdObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const record = value as Record<string, unknown>;
  return '@context' in record || '@type' in record || '@graph' in record;
}

interface CollectState {
  foundJsonLd: boolean;
}

function isProbablyUrl(value: string): boolean {
  return /^(https?:)?\/\//i.test(value.trim());
}

function collectImageUrls(
  value: unknown,
  target: Set<string>,
  state: CollectState,
  seen: Set<unknown>,
  depth = 0
): void {
  if (value === null || value === undefined) {
    return;
  }
  if (depth > 10) {
    return;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }
    const parsed = tryParseJson(trimmed);
    if (parsed !== null) {
      collectImageUrls(parsed, target, state, seen, depth + 1);
      return;
    }
    if (isProbablyUrl(trimmed)) {
      target.add(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageUrls(item, target, state, seen, depth + 1);
    }
    return;
  }
  if (typeof value === 'object') {
    if (seen.has(value)) {
      return;
    }
    seen.add(value);
    const record = value as Record<string, unknown>;
    if (isJsonLdObject(record)) {
      state.foundJsonLd = true;
    }
    if ('image' in record) {
      collectImageUrls(record.image, target, state, seen, depth + 1);
    }
    if ('url' in record && typeof record.url === 'string' && isProbablyUrl(record.url)) {
      target.add(record.url.trim());
    }
    if ('@graph' in record) {
      collectImageUrls(record['@graph'], target, state, seen, depth + 1);
    }
    for (const key of Object.keys(record)) {
      if (key === 'image' || key === '@graph' || key === 'url') {
        continue;
      }
      const item = record[key];
      if (Array.isArray(item) || (item && typeof item === 'object')) {
        collectImageUrls(item, target, state, seen, depth + 1);
      }
    }
  }
}

function normalizeImagesField(value: unknown, warnings: string[]): string[] {
  if (value === null || value === undefined) {
    return [];
  }
  let workingValue: unknown = value;
  const state: CollectState = { foundJsonLd: false };
  let parsedFromString = false;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return [];
    }
    const parsed = tryParseJson(trimmed);
    if (parsed !== null) {
      workingValue = parsed;
      parsedFromString = true;
    } else if (isProbablyUrl(trimmed)) {
      return [trimmed];
    } else {
      warnings.push('images_json non-json string ignored');
      return [];
    }
  }

  const results = new Set<string>();
  collectImageUrls(workingValue, results, state, new Set());
  if (parsedFromString) {
    warnings.push('images_json parsed from string');
  }
  if (state.foundJsonLd) {
    warnings.push('images_json extracted from JSON-LD');
  }
  return Array.from(results);
}

function normalizeDescHtml(value: unknown, warnings: string[]): string {
  if (typeof value !== 'string') {
    return '';
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  const decoded = he.decode(trimmed);
  if (decoded !== trimmed) {
    warnings.push('desc_html unescaped');
  }
  return decoded;
}

function normalizeOptionalDate(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return null;
}

interface NormalizeProductOptions {
  slug: string;
  requestId?: string;
}

interface NormalizeResult {
  normalized: NormalizedProduct;
  warnings: string[];
}

function normalizeProductRecordInternal(
  record: RawProductRecord,
  options: NormalizeProductOptions
): NormalizeResult {
  const warnings: string[] = [];
  const normalized: NormalizedProduct = {
    title_h1: toCleanString(record.title_h1 ?? record.slug ?? options.slug) || options.slug,
    brand: toCleanString(record.brand),
    model: toCleanString(record.model),
    sku: toCleanString(record.sku),
    images: normalizeImagesField(record.images_json ?? record.images ?? null, warnings),
    desc_html: normalizeDescHtml(record.desc_html, warnings),
    short_summary: toCleanString(record.short_summary),
    meta_description: toCleanString(record.meta_description),
    slug: toCleanString(record.slug) || options.slug,
    price: toCleanString(record.price),
    cta_lead_url: toCleanString(record.cta_lead_url),
    cta_affiliate_url: toCleanString(record.cta_affiliate_url),
    cta_stripe_url: toCleanString(record.cta_stripe_url),
    cta_paypal_url: toCleanString(record.cta_paypal_url),
    last_tidb_update_at: normalizeOptionalDate(record.last_tidb_update_at)
  };

  return { normalized, warnings };
}

export function resolvePrimaryCta(product: Product): { type: keyof Product['ctas']; url: string } | null {
  if (product.ctas.lead) {
    return { type: 'lead', url: product.ctas.lead };
  }
  if (product.ctas.affiliate) {
    return { type: 'affiliate', url: product.ctas.affiliate };
  }
  if (product.ctas.stripe) {
    return { type: 'stripe', url: product.ctas.stripe };
  }
  if (product.ctas.paypal) {
    return { type: 'paypal', url: product.ctas.paypal };
  }
  return null;
}

export async function getPublishedProductBySlug(slug: string): Promise<Product | null> {
  const pool = getPool();
  const [rows] = await pool.query('SELECT * FROM products WHERE slug = ? LIMIT 1', [slug]);
  const record = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  if (!record) {
    return null;
  }
  const parsed = productSchema.parse(record);
  const isPublished = parsed.is_published === 1 || parsed.is_published === true;
  if (!isPublished) {
    return null;
  }
  const product: Product = {
    id: typeof parsed.id === 'bigint' ? parsed.id : BigInt(parsed.id),
    slug: parsed.slug,
    title: parsed.title_h1,
    brand: parsed.brand,
    model: parsed.model,
    sku: parsed.sku,
    shortSummary: parsed.short_summary,
    images: parseImages(parsed.images_json),
    descriptionHtml: parsed.desc_html,
    ctas: {
      lead: parsed.cta_lead_url,
      affiliate: parsed.cta_affiliate_url,
      stripe: parsed.cta_stripe_url,
      paypal: parsed.cta_paypal_url
    },
    price: parsed.price,
    lastUpdatedAt: parsed.last_tidb_update_at
  };
  return product;
}

export async function getPublishedSlugs(limit = 50000, offset = 0): Promise<string[]> {
  const pool = getPool();
  const [rows] = await pool.query(
    'SELECT slug FROM products WHERE is_published = 1 ORDER BY id ASC LIMIT ? OFFSET ?',
    [limit, offset]
  );
  if (!Array.isArray(rows)) {
    return [];
  }
  return rows.map((row: any) => row.slug as string);
}

function isPublishedFlag(value: unknown): boolean {
  return value === 1 || value === true || value === '1';
}

export function isProductPublished(record: RawProductRecord | null): boolean {
  if (!record || typeof record !== 'object') {
    return false;
  }
  return isPublishedFlag((record as Record<string, unknown>).is_published);
}

export async function getProductRecordBySlug(
  slug: string,
  requestId?: string
): Promise<RawProductRecord | null> {
  const pool = getPool();
  const startedAt = Date.now();
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE slug = ? LIMIT 1', [slug]);
    const duration = Date.now() - startedAt;
    const count = Array.isArray(rows) ? rows.length : 0;
    console.log(
      `[products][query] slug=${slug} rows=${count} (${duration}ms)${requestId ? ` [${requestId}]` : ''}`
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      return null;
    }
    return rows[0] as RawProductRecord;
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(
      `[products][query-error] slug=${slug} (${duration}ms)${requestId ? ` [${requestId}]` : ''}`,
      toDbErrorInfo(error)
    );
    throw error;
  }
}

export async function getPublishedSlugsForDebug(limit: number): Promise<string[]> {
  const pool = getPool();
  const queryLimit = Math.max(1, Math.min(limit, 100));
  try {
    const [rows] = await pool.query(
      'SELECT slug FROM products WHERE is_published = 1 ORDER BY last_tidb_update_at DESC LIMIT ?',
      [queryLimit]
    );
    if (!Array.isArray(rows)) {
      return [];
    }
    return rows.map((row: any) => row.slug as string);
  } catch (error) {
    const err = error as { code?: string };
    if (err && typeof err === 'object' && err?.code === 'ER_BAD_FIELD_ERROR') {
      const [rows] = await pool.query(
        'SELECT slug FROM products WHERE is_published = 1 ORDER BY slug ASC LIMIT ?',
        [queryLimit]
      );
      if (!Array.isArray(rows)) {
        return [];
      }
      return rows.map((row: any) => row.slug as string);
    }
    throw error;
  }
}

function logNormalizationWarnings(slug: string, warnings: string[], requestId?: string) {
  if (warnings.length === 0) {
    return;
  }
  console.warn(
    `[products][normalize] slug=${slug}${requestId ? ` [${requestId}]` : ''} ${warnings.join('; ')}`
  );
}

export async function getNormalizedPublishedProduct(
  slug: string,
  options?: { requestId?: string; skipCache?: boolean }
): Promise<NormalizedProductResult | null> {
  const requestId = options?.requestId;
  if (!options?.skipCache) {
    const cached = readProductCache(slug, requestId);
    if (cached) {
      return cached;
    }
  } else {
    console.log(`[isr-cache][product] slug=${slug} BYPASS${cacheLabel(requestId)}`);
  }

  const record = await getProductRecordBySlug(slug, requestId);
  if (!record) {
    console.log(`[products][lookup] slug=${slug} not-found${cacheLabel(requestId)}`);
    return null;
  }
  if (!isProductPublished(record)) {
    console.log(`[products][lookup] slug=${slug} unpublished${cacheLabel(requestId)}`);
    return null;
  }

  const { normalized, warnings } = normalizeProductRecordInternal(record, { slug, requestId });
  logNormalizationWarnings(slug, warnings, requestId);
  const result: NormalizedProductResult = { raw: record, normalized };
  writeProductCache(slug, result);
  return result;
}

export interface SitemapProductRecord {
  id: bigint;
  slug: string;
  last_tidb_update_at?: string | null;
  updated_at?: string | null;
}

export interface SitemapQueryOptions {
  requestId?: string;
  limit?: number;
  offset?: number;
}

export interface SitemapQueryResult {
  records: SitemapProductRecord[];
  hasMore: boolean;
}

function parseBigint(value: bigint | number | string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(Math.trunc(value));
  }
  return BigInt(value);
}

function mapRowToSitemapRecord(row: any): SitemapProductRecord {
  const rawId = row.id;
  if (rawId === null || rawId === undefined) {
    throw new Error('Sitemap row missing id');
  }
  const id = parseBigint(rawId);
  return {
    id,
    slug: String(row.slug),
    last_tidb_update_at: row.last_tidb_update_at ?? null,
    updated_at: row.updated_at ?? null
  };
}

export async function getPublishedProductsForSitemap(
  options?: SitemapQueryOptions
): Promise<SitemapQueryResult> {
  const pool = getPool();
  const requestId = options?.requestId;
  const limit =
    typeof options?.limit === 'number' && Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(options.limit))
      : DEFAULT_SITEMAP_LIMIT;
  const offset =
    typeof options?.offset === 'number' && Number.isFinite(options.offset)
      ? Math.max(0, Math.floor(options.offset))
      : 0;
  const startedAt = Date.now();
  try {
    const sql =
      'SELECT id, slug, last_tidb_update_at, updated_at FROM products WHERE is_published = 1 ORDER BY slug ASC, id ASC LIMIT ? OFFSET ?';
    const limitPlusOne = limit + 1;
    const params: Array<any> = [limitPlusOne, offset];
    const [rows] = await pool.query(sql, params);
    const duration = Date.now() - startedAt;
    const count = Array.isArray(rows) ? rows.length : 0;
    console.log(
      `[products][query] sitemap count=${count} limit=${limit} offset=${offset} (${duration}ms)${
        requestId ? ` [${requestId}]` : ''
      }`
    );
    if (!Array.isArray(rows)) {
      return { records: [], hasMore: false };
    }
    const mapped = rows.map((row: any) => mapRowToSitemapRecord(row));
    let hasMore = false;
    let records = mapped;
    if (mapped.length > limit) {
      hasMore = true;
      records = mapped.slice(0, limit);
    }
    return { records, hasMore };
  } catch (error) {
    const err = error as { code?: string };
    if (err && typeof err === 'object' && err.code === 'ER_BAD_FIELD_ERROR') {
      const fallbackStartedAt = Date.now();
      const fallbackSql =
        'SELECT id, slug FROM products WHERE is_published = 1 ORDER BY slug ASC, id ASC LIMIT ? OFFSET ?';
      const limitPlusOne = limit + 1;
      const params: Array<any> = [limitPlusOne, offset];
      const [rows] = await pool.query(fallbackSql, params);
      const duration = Date.now() - fallbackStartedAt;
      const count = Array.isArray(rows) ? rows.length : 0;
      console.warn(
        `[products][query] sitemap fallback without timestamps count=${count} limit=${limit} offset=${offset} (${duration}ms)${
          requestId ? ` [${requestId}]` : ''
        }`
      );
      if (!Array.isArray(rows)) {
        return { records: [], hasMore: false };
      }
      const mapped = rows.map((row: any) => mapRowToSitemapRecord(row));
      let hasMore = false;
      let records = mapped;
      if (mapped.length > limit) {
        hasMore = true;
        records = mapped.slice(0, limit);
      }
      return { records, hasMore };
    }
    const duration = Date.now() - startedAt;
    console.error(
      `[products][query-error] sitemap (${duration}ms)${requestId ? ` [${requestId}]` : ''}`,
      toDbErrorInfo(error)
    );
    throw error;
  }
}

export interface SitemapBatchCollectionOptions {
  requestId?: string;
  pageSize: number;
}

export interface SitemapBatchCollectionResult {
  batches: SitemapProductRecord[][];
  totalCount: number;
}

export async function collectPublishedProductsForSitemap(
  options: SitemapBatchCollectionOptions
): Promise<SitemapBatchCollectionResult> {
  const batches: SitemapProductRecord[][] = [];
  let totalCount = 0;
  let offset = 0;
  for (let pageIndex = 0; pageIndex < 10000; pageIndex++) {
    const { records, hasMore } = await getPublishedProductsForSitemap({
      requestId: options.requestId,
      limit: options.pageSize,
      offset
    });
    if (records.length === 0) {
      break;
    }
    batches.push(records);
    totalCount += records.length;
    if (!hasMore) {
      break;
    }
    offset += records.length;
  }

  return { batches, totalCount };
}

export async function getPublishedProductsForSitemapPage(
  pageNumber: number,
  pageSize: number,
  options?: { requestId?: string }
): Promise<SitemapProductRecord[]> {
  if (!Number.isFinite(pageNumber) || pageNumber <= 0) {
    return [];
  }

  const offset = (pageNumber - 1) * pageSize;
  const { records } = await getPublishedProductsForSitemap({
    requestId: options?.requestId,
    limit: pageSize,
    offset
  });
  return records;
}

export async function getPublishedProductsBySlugs(slugs: string[]): Promise<NormalizedProductResult[]> {
  if (!Array.isArray(slugs) || slugs.length === 0) {
    return [];
  }

  const pool = getPool();
  const [rows] = await pool.query('SELECT * FROM products WHERE slug IN (?)', [slugs]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const results = new Map<string, NormalizedProductResult>();

  for (const row of rows) {
    try {
      const parsed = productSchema.parse(row);
      const isPublished = parsed.is_published === 1 || parsed.is_published === true;
      if (!isPublished) {
        continue;
      }
      const slug = typeof parsed.slug === 'string' ? parsed.slug : '';
      if (!slug) {
        continue;
      }
      const { normalized } = normalizeProductRecordInternal(parsed, { slug });
      const result: NormalizedProductResult = {
        raw: parsed,
        normalized
      };
      results.set(normalized.slug, result);
    } catch (error) {
      console.warn('[products][algolia] unable to parse record', error);
    }
  }

  const ordered: NormalizedProductResult[] = [];
  for (const slug of slugs) {
    const key = typeof slug === 'string' ? slug.trim() : '';
    if (!key) {
      continue;
    }
    const entry = results.get(key);
    if (entry) {
      ordered.push(entry);
    }
  }

  return ordered;
}
