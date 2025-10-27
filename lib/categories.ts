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

export async function getPublishedProductsForCategory(
  categoryId: bigint,
  options: CategoryProductsQueryOptions = {}
): Promise<CategoryProductsQueryResult> {
  const pool = getPool();
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const requestId = options.requestId;

  const sql = `SELECT p.id, p.slug, p.title_h1, p.short_summary, p.price, p.images_json, p.last_tidb_update_at, p.updated_at\n    FROM category_products cp\n    INNER JOIN products p ON p.id = cp.product_id\n    WHERE cp.category_id = ? AND p.is_published = 1\n    ORDER BY p.title_h1 ASC\n    LIMIT ? OFFSET ?`;

  try {
    const [rows] = await pool.query(sql, [categoryId.toString(), limit, offset]);
    const parsed = z.array(categoryProductRecordSchema).safeParse(rows);
    if (!parsed.success) {
      console.error('[categories] failed to parse product rows', parsed.error.format());
      return { products: [], totalCount: 0 };
    }

    const products = parsed.data.map(normalizeCategoryProductRecord);
    const totalCount = await countCategoryProducts(categoryId);

    return { products, totalCount };
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] category products error', info, requestId ? { requestId } : undefined);
    return { products: [], totalCount: 0 };
  }
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
