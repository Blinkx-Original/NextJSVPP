import { z } from 'zod';
import { getPool, toDbErrorInfo } from './db';

const bigintLike = z.union([z.bigint(), z.number(), z.string()]);
type BigintLike = z.infer<typeof bigintLike>;

const CATEGORY_TYPE_SYNONYMS: Record<'product' | 'blog', string[]> = {
  product: ['product', 'products', 'product_category'],
  blog: ['blog', 'blogs', 'blog_category']
};

function normalizeCategoryType(value: string): 'product' | 'blog' {
  const normalized = value.trim().toLowerCase();
  if (CATEGORY_TYPE_SYNONYMS.blog.includes(normalized)) {
    return 'blog';
  }
  return 'product';
}

export function getCategoryTypeSynonyms(type: 'product' | 'blog'): string[] {
  return CATEGORY_TYPE_SYNONYMS[type];
}

const categoryRecordSchema = z.object({
  id: bigintLike,
  type: z
    .string()
    .transform((value) => normalizeCategoryType(value))
    .pipe(z.enum(['product', 'blog'])),
  slug: z.string(),
  name: z.string(),
  short_description: z.string().nullable().optional(),
  hero_image_url: z.string().nullable().optional(),
  last_tidb_update_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional()
});

const categoryPickerRecordSchema = z.object({
  type: z
    .string()
    .transform((value) => normalizeCategoryType(value))
    .pipe(z.enum(['product', 'blog'])),
  slug: z.string(),
  name: z.string()
});

export type CategoryRecord = z.infer<typeof categoryRecordSchema>;

export interface CategorySummary {
  id: bigint;
  type: 'product' | 'blog';
  slug: string;
  name: string;
  shortDescription: string | null;
  heroImageUrl: string | null;
  lastUpdatedAt: string | null;
}

export interface CategoryPickerOption {
  type: 'product' | 'blog';
  slug: string;
  name: string;
}

export interface CategoryQueryOptions {
  type?: 'product' | 'blog';
  limit?: number;
  offset?: number;
  requestId?: string;
}

export interface CategoryQueryResult {
  categories: CategorySummary[];
  totalCount: number;
}

export interface CategoryPickerOptions {
  type?: 'product' | 'blog';
  requestId?: string;
}

function toBigInt(value: BigintLike): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return BigInt(value);
}

function toTrimmedOrNull(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== 'string') {
    return String(value);
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeCategoryRecord(record: CategoryRecord): CategorySummary {
  const lastUpdatedAt = record.updated_at || record.last_tidb_update_at || null;
  return {
    id: toBigInt(record.id),
    type: record.type,
    slug: record.slug,
    name: record.name,
    shortDescription: toTrimmedOrNull(record.short_description),
    heroImageUrl: toTrimmedOrNull(record.hero_image_url),
    lastUpdatedAt: lastUpdatedAt && lastUpdatedAt.length > 0 ? lastUpdatedAt : null
  };
}

async function countPublishedCategories(
  filters: Pick<CategoryQueryOptions, 'type'>
): Promise<number> {
  const pool = getPool();
  const where: string[] = ['is_published = 1'];
  const params: unknown[] = [];
  if (filters.type) {
    const synonyms = getCategoryTypeSynonyms(filters.type);
    where.push(`LOWER(type) IN (${synonyms.map(() => '?').join(', ')})`);
    params.push(...synonyms);
  }
  const sql = `SELECT COUNT(*) AS total FROM categories WHERE ${where.join(' AND ')}`;
  const [rows] = await pool.query(sql, params);
  const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
  const value = row && typeof row.total !== 'undefined' ? row.total : 0;
  const total = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  return Number.isFinite(total) && total > 0 ? total : 0;
}

export async function getPublishedCategories(
  options: CategoryQueryOptions = {}
): Promise<CategoryQueryResult> {
  const pool = getPool();
  const limit = options.limit ?? 30;
  const offset = options.offset ?? 0;
  const requestId = options.requestId;

  const where: string[] = ['is_published = 1'];
  const params: unknown[] = [];
  if (options.type) {
    const synonyms = getCategoryTypeSynonyms(options.type);
    where.push(`LOWER(type) IN (${synonyms.map(() => '?').join(', ')})`);
    params.push(...synonyms);
  }

  const sql = `SELECT id, type, slug, name, short_description, hero_image_url, last_tidb_update_at, updated_at\n    FROM categories\n    WHERE ${where.join(' AND ')}\n    ORDER BY type ASC, name ASC\n    LIMIT ? OFFSET ?`;

  params.push(limit);
  params.push(offset);

  try {
    const [rows] = await pool.query(sql, params);
    const parsed = z.array(categoryRecordSchema).safeParse(rows);
    if (!parsed.success) {
      console.error('[categories] failed to parse category rows', parsed.error.format());
      return { categories: [], totalCount: 0 };
    }

    const categories = parsed.data.map(normalizeCategoryRecord);
    const totalCount = await countPublishedCategories({ type: options.type });

    return { categories, totalCount };
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] query error', info, requestId ? { requestId } : undefined);
    return { categories: [], totalCount: 0 };
  }
}

export async function getPublishedCategoryPickerOptions(
  options: CategoryPickerOptions = {}
): Promise<CategoryPickerOption[]> {
  const pool = getPool();
  const where: string[] = ['is_published = 1'];
  const params: unknown[] = [];

  if (options.type) {
    const synonyms = getCategoryTypeSynonyms(options.type);
    where.push(`LOWER(type) IN (${synonyms.map(() => '?').join(', ')})`);
    params.push(...synonyms);
  }

  const sql = `SELECT type, slug, name
    FROM categories
    WHERE ${where.join(' AND ')}
    ORDER BY name ASC`;

  try {
    const [rows] = await pool.query(sql, params);
    const parsed = z.array(categoryPickerRecordSchema).safeParse(rows);
    if (!parsed.success) {
      console.error('[categories] failed to parse category picker rows', parsed.error.format());
      return [];
    }

    return parsed.data.map((item) => ({
      type: item.type,
      slug: item.slug,
      name: item.name
    }));
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] picker query error', info, options.requestId ? { requestId: options.requestId } : undefined);
    return [];
  }
}

export async function categoryExistsByType(
  type: 'product' | 'blog',
  slug: string
): Promise<boolean> {
  const pool = getPool();
  const sql = `SELECT 1
    FROM categories
    WHERE LOWER(type) = ?
      AND slug = ?
    LIMIT 1`;

  try {
    const [rows] = await pool.query(sql, [type, slug]);
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.error('[categories] exists query error', toDbErrorInfo(error));
    return false;
  }
}

export interface CategoryBySlugOptions {
  requestId?: string;
}

export async function getPublishedCategoryBySlug(
  slug: string,
  options: CategoryBySlugOptions = {}
): Promise<CategorySummary | null> {
  const pool = getPool();
  const requestId = options.requestId;

  const sql = `SELECT id, type, slug, name, short_description, hero_image_url, last_tidb_update_at, updated_at\n    FROM categories\n    WHERE slug = ? AND is_published = 1\n    LIMIT 1`;

  try {
    const [rows] = await pool.query(sql, [slug]);
    const parsed = z.array(categoryRecordSchema).safeParse(rows);
    if (!parsed.success || parsed.data.length === 0) {
      return null;
    }
    return normalizeCategoryRecord(parsed.data[0]!);
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] lookup error', info, requestId ? { requestId } : undefined);
    return null;
  }
}

const categoryProductRecordSchema = z.object({
  id: bigintLike,
  slug: z.string(),
  title_h1: z.string(),
  short_summary: z.string().nullable().optional(),
  price: z.string().nullable().optional(),
  images_json: z.string().nullable().optional(),
  last_tidb_update_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional()
});

export interface CategoryProductSummary {
  id: bigint;
  slug: string;
  title: string;
  shortSummary: string | null;
  price: string | null;
  primaryImage: string | null;
  lastUpdatedAt: string | null;
}

export interface CategoryProductsQueryOptions {
  limit?: number;
  offset?: number;
  requestId?: string;
}

export interface CategoryProductsQueryResult {
  products: CategoryProductSummary[];
  totalCount: number;
}

function parseImages(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    }
  } catch (error) {
    console.warn('[categories] unable to parse images_json', error);
  }
  return [];
}

function normalizeCategoryProductRecord(record: z.infer<typeof categoryProductRecordSchema>): CategoryProductSummary {
  const images = parseImages(record.images_json ?? null);
  const lastUpdatedAt = record.updated_at || record.last_tidb_update_at || null;
  return {
    id: toBigInt(record.id),
    slug: record.slug,
    title: record.title_h1,
    shortSummary: toTrimmedOrNull(record.short_summary),
    price: toTrimmedOrNull(record.price),
    primaryImage: images.length > 0 ? images[0]! : null,
    lastUpdatedAt: lastUpdatedAt && lastUpdatedAt.length > 0 ? lastUpdatedAt : null
  };
}

async function countCategoryProducts(categoryId: bigint): Promise<number> {
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT COUNT(*) AS total\n        FROM category_products cp\n        INNER JOIN products p ON p.id = cp.product_id\n        WHERE cp.category_id = ? AND p.is_published = 1`,
      [categoryId.toString()]
    );
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
    const value = row && typeof row.total !== 'undefined' ? row.total : 0;
    const total = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(total) && total > 0 ? total : 0;
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] count products error', info);
    return 0;
  }
}

type LegacyCategoryColumn = 'category' | 'category_slug';

const LEGACY_CATEGORY_COLUMNS: LegacyCategoryColumn[] = ['category', 'category_slug'];

function addLegacyCategoryVariant(values: Set<string>, raw: string | null | undefined) {
  if (!raw) {
    return;
  }
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return;
  }
  values.add(trimmed);
}

function toSlugLike(value: string): string | null {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase();
  if (normalized.length === 0) {
    return null;
  }
  return normalized.replace(/\s+/g, '-');
}

function buildLegacyCategoryMatches(category: Pick<CategorySummary, 'slug' | 'name'>): string[] {
  const values = new Set<string>();
  const slug = category.slug?.trim();
  if (slug) {
    addLegacyCategoryVariant(values, slug);
    addLegacyCategoryVariant(values, slug.replace(/[-_]+/g, ' ').replace(/\s+/g, ' '));
    addLegacyCategoryVariant(values, slug.replace(/[-\s]+/g, '_').replace(/_+/g, '_'));
  }
  const name = category.name?.trim();
  if (name) {
    addLegacyCategoryVariant(values, name);
    const slugLike = toSlugLike(name);
    if (slugLike) {
      addLegacyCategoryVariant(values, slugLike);
      addLegacyCategoryVariant(values, slugLike.replace(/-/g, ' '));
      addLegacyCategoryVariant(values, slugLike.replace(/-/g, '_'));
    }
  }
  return Array.from(values)
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isUnknownColumnError(error: unknown): boolean {
  const info = toDbErrorInfo(error);
  return info.code === 'ER_BAD_FIELD_ERROR' || info.errno === 1054;
}

interface LegacyCategoryQueryParts {
  where: string;
  params: string[];
}

function normalizeLegacyCategoryVariants(variants: string[]): string[] {
  if (variants.length === 0) {
    return [];
  }

  const normalized = new Set<string>();
  for (const raw of variants) {
    const value = raw.toLowerCase().trim();
    if (value.length > 0) {
      normalized.add(value);
    }
  }
  return Array.from(normalized);
}

function buildLegacyCategoryQueryParts(
  column: LegacyCategoryColumn,
  variants: string[]
): LegacyCategoryQueryParts | null {
  const normalizedVariants = normalizeLegacyCategoryVariants(variants);
  if (normalizedVariants.length === 0) {
    return null;
  }

  const placeholders = normalizedVariants.map(() => '?').join(', ');
  return {
    where: `is_published = 1 AND LOWER(${column}) IN (${placeholders})`,
    params: normalizedVariants
  };
}

async function runLegacyCategoryCount(
  column: LegacyCategoryColumn,
  variants: string[]
): Promise<number | null> {
  const query = buildLegacyCategoryQueryParts(column, variants);
  if (!query) {
    return 0;
  }

  const pool = getPool();
  const sql = `SELECT COUNT(*) AS total
        FROM products
        WHERE ${query.where}`;
  const params = query.params;
  try {
    const [rows] = await pool.query(sql, params);
    const row = Array.isArray(rows) && rows.length > 0 ? (rows[0] as Record<string, unknown>) : null;
    const value = row && typeof row.total !== 'undefined' ? row.total : 0;
    const total = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
    return Number.isFinite(total) && total > 0 ? total : 0;
  } catch (error) {
    if (isUnknownColumnError(error)) {
      return null;
    }
    const info = toDbErrorInfo(error);
    console.error('[categories] legacy count products error', info, { column });
    return 0;
  }
}

async function runLegacyCategoryQuery(
  column: LegacyCategoryColumn,
  variants: string[],
  options: CategoryProductsQueryOptions
): Promise<CategoryProductsQueryResult | null> {
  const query = buildLegacyCategoryQueryParts(column, variants);
  if (!query) {
    return { products: [], totalCount: 0 };
  }

  const pool = getPool();
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const requestId = options.requestId;
  const params = [...query.params, limit, offset];

  let rows: unknown = [];
  let unknownColumn = false;
  let fallbackResult: CategoryProductsQueryResult | null = null;

  try {
    const [rawRows] = await pool.query(
      `SELECT id, slug, title_h1, short_summary, price, images_json, last_tidb_update_at, updated_at
        FROM products
        WHERE ${query.where}
        ORDER BY title_h1 ASC
        LIMIT ? OFFSET ?`,
      params
    );
    rows = rawRows;
  } catch (error) {
    if (isUnknownColumnError(error)) {
      unknownColumn = true;
    } else {
      const info = toDbErrorInfo(error);
      console.error('[categories] legacy category products error', info, requestId ? { requestId } : undefined);
      fallbackResult = { products: [], totalCount: 0 };
    }
  }

  if (unknownColumn) {
    return null;
  }

  if (fallbackResult) {
    return fallbackResult;
  }

  const parsed = z.array(categoryProductRecordSchema).safeParse(rows);
  if (!parsed.success) {
    console.error(
      '[categories] failed to parse legacy product rows',
      parsed.error.format(),
      requestId ? { requestId } : undefined
    );
    return { products: [], totalCount: 0 };
  }

  const products = parsed.data.map(normalizeCategoryProductRecord);
  const totalCount = await runLegacyCategoryCount(column, variants);
  return { products, totalCount: totalCount ?? 0 };
}

async function countLegacyCategoryProducts(category: Pick<CategorySummary, 'slug' | 'name'>): Promise<number> {
  const variants = buildLegacyCategoryMatches(category);
  for (const column of LEGACY_CATEGORY_COLUMNS) {
    const total = await runLegacyCategoryCount(column, variants);
    if (total === null) {
      continue;
    }
    if (total > 0) {
      return total;
    }
  }
  return 0;
}

async function queryLegacyCategoryProducts(
  category: Pick<CategorySummary, 'slug' | 'name'>,
  options: CategoryProductsQueryOptions
): Promise<CategoryProductsQueryResult> {
  const variants = buildLegacyCategoryMatches(category);
  for (const column of LEGACY_CATEGORY_COLUMNS) {
    const result = await runLegacyCategoryQuery(column, variants, options);
    if (result === null) {
      continue;
    }
    if (result.products.length > 0 || result.totalCount > 0) {
      return result;
    }
  }
  return { products: [], totalCount: 0 };
}

export async function getPublishedProductsForCategory(
  category: Pick<CategorySummary, 'id' | 'slug' | 'name'>,
  options: CategoryProductsQueryOptions = {}
): Promise<CategoryProductsQueryResult> {
  const pool = getPool();
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const requestId = options.requestId;
  const placeholders = matches.map(() => '?').join(', ');
  const where = `is_published = 1 AND LOWER(${column}) IN (${placeholders})`;
  const params = [...matches.map((value) => value.toLowerCase()), limit, offset];

  try {
    const [rows] = await pool.query(sql, [category.id.toString(), limit, offset]);
    const parsed = z.array(categoryProductRecordSchema).safeParse(rows);
    if (parsed.success) {
      const products = parsed.data.map(normalizeCategoryProductRecord);
      let totalCount = await countCategoryProducts(category.id);
      if (products.length > 0 && totalCount === 0) {
        totalCount = products.length;
      }
      if (products.length > 0 || totalCount > 0) {
        return { products, totalCount };
      }
    } else {
      console.error('[categories] failed to parse product rows', parsed.error.format(), requestId ? { requestId } : undefined);
    }
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] category products error', info, requestId ? { requestId } : undefined);
  }

  if (!category.slug) {
    return { products: [], totalCount: 0 };
  }

  return queryLegacyCategoryProducts(category, options);
}

export interface CategorySitemapEntry {
  slug: string;
  type: 'product' | 'blog';
  lastUpdatedAt: string | null;
}

export async function getPublishedCategorySitemapEntries(): Promise<CategorySitemapEntry[]> {
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, type, slug, name, short_description, hero_image_url, last_tidb_update_at, updated_at\n        FROM categories\n        WHERE is_published = 1`
    );
    const parsed = z.array(categoryRecordSchema).safeParse(rows);
    if (!parsed.success) {
      console.error('[categories] failed to parse sitemap categories', parsed.error.format());
      return [];
    }
    return parsed.data.map((record) => ({
      slug: record.slug,
      type: record.type,
      lastUpdatedAt: record.updated_at || record.last_tidb_update_at || null
    }));
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] sitemap query error', info);
    return [];
  }
}
