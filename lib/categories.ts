import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { slugifyCategoryName } from './category-slug';
import { getPool, toDbErrorInfo } from './db';
import { slugifyCategoryName } from './category-slug';

// -- Category type helpers --------------------------------------------------

type SqlClient = Pool | PoolConnection;

type CategoryType = 'product' | 'blog';

export type ProductCategoryColumn = 'category' | 'category_slug' | 'categories';
export type BlogCategoryColumn = 'category_slug' | 'category';

let cachedProductCategoryColumns: ProductCategoryColumn[] | undefined;
let cachedBlogCategoryColumn: BlogCategoryColumn | null | undefined;

async function detectProductCategoryColumns(client: SqlClient): Promise<ProductCategoryColumn[]> {
  if (cachedProductCategoryColumns !== undefined) {
    return cachedProductCategoryColumns;
  }

  const columns: ProductCategoryColumn[] = [];
  const candidates: ProductCategoryColumn[] = ['category', 'category_slug', 'categories'];

  for (const column of candidates) {
    try {
      const [rows] = await client.query<RowDataPacket[]>(`SHOW COLUMNS FROM products LIKE ?`, [column]);
      if (Array.isArray(rows) && rows.length > 0) {
        columns.push(column);
      }
    } catch (error) {
      const info = toDbErrorInfo(error);
      console.warn('[categories] failed to inspect product column', info);
    }
  }

  cachedProductCategoryColumns = columns;
  return columns;
}

export async function getProductCategoryColumns(client?: SqlClient): Promise<ProductCategoryColumn[]> {
  if (cachedProductCategoryColumns !== undefined) {
    return cachedProductCategoryColumns;
  }
  const pool = client ?? getPool();
  return detectProductCategoryColumns(pool);
}

async function detectBlogCategoryColumn(client: SqlClient): Promise<BlogCategoryColumn | null> {
  if (cachedBlogCategoryColumn !== undefined) {
    return cachedBlogCategoryColumn;
  }

  const candidates: BlogCategoryColumn[] = ['category_slug', 'category'];

  for (const column of candidates) {
    try {
      const [rows] = await client.query<RowDataPacket[]>(`SHOW COLUMNS FROM posts LIKE ?`, [column]);
      if (Array.isArray(rows) && rows.length > 0) {
        cachedBlogCategoryColumn = column;
        return column;
      }
    } catch (error) {
      const info = toDbErrorInfo(error);
      console.warn('[categories] failed to inspect blog posts column', info);
    }
  }

  cachedBlogCategoryColumn = null;
  return null;
}

export async function getBlogCategoryColumn(client?: SqlClient): Promise<BlogCategoryColumn | null> {
  if (cachedBlogCategoryColumn !== undefined) {
    return cachedBlogCategoryColumn;
  }
  const pool = client ?? getPool();
  return detectBlogCategoryColumn(pool);
}

function normalizeCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function getCategoryTypeSynonyms(type: CategoryType): string[] {
  if (type === 'blog') {
    return ['blog', 'blogs'];
  }
  return ['product', 'products'];
}

const bigintLike = z.union([z.bigint(), z.number(), z.string()]);

type BigintLike = z.infer<typeof bigintLike>;

const categoryRecordSchema = z.object({
  id: bigintLike,
  type: z.string(),
  slug: z.string(),
  name: z.string(),
  short_description: z.string().nullable().optional(),
  long_description: z.string().nullable().optional(),
  hero_image_url: z.string().nullable().optional(),
  last_tidb_update_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional()
});

function toBigInt(value: BigintLike): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(Math.trunc(value));
  }
  return BigInt(value);
}

function toTrimmedOrNull(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export type CategoryRecord = z.infer<typeof categoryRecordSchema>;

export interface CategorySummary {
  id: bigint;
  type: CategoryType;
  slug: string;
  name: string;
  shortDescription: string | null;
  longDescription: string | null;
  heroImageUrl: string | null;
  lastUpdatedAt: string | null;
}

function normalizeCategoryRecord(record: CategoryRecord): CategorySummary {
  const typeValue = record.type?.toLowerCase() === 'blog' ? 'blog' : 'product';
  const lastUpdated = record.updated_at || record.last_tidb_update_at || null;
  return {
    id: toBigInt(record.id),
    type: typeValue,
    slug: record.slug,
    name: record.name,
    shortDescription: toTrimmedOrNull(record.short_description),
    longDescription: toTrimmedOrNull(record.long_description),
    heroImageUrl: toTrimmedOrNull(record.hero_image_url),
    lastUpdatedAt: lastUpdated && lastUpdated.trim().length > 0 ? lastUpdated : null
  };
}

export interface CategoryPickerOption {
  type: CategoryType;
  slug: string;
  name: string;
}

export interface CategoryQueryOptions {
  type?: CategoryType;
  limit?: number;
  offset?: number;
  requestId?: string;
}

export interface CategoryQueryResult {
  categories: CategorySummary[];
  totalCount: number;
}

export interface CategoryPickerOptions {
  type?: CategoryType;
  requestId?: string;
}

export interface AllCategoriesQueryOptions {
  type?: CategoryType;
  batchSize?: number;
  requestId?: string;
}

function buildCategoryWhereClause(options: { type?: CategoryType }): { where: string; params: unknown[] } {
  const where: string[] = ['is_published = 1'];
  const params: unknown[] = [];

  if (options.type) {
    const synonyms = getCategoryTypeSynonyms(options.type);
    const placeholders = synonyms.map(() => '?').join(', ');
    where.push(`LOWER(type) IN (${placeholders})`);
    params.push(...synonyms);
  }

  return { where: where.join(' AND '), params };
}

export async function getPublishedCategories(options: CategoryQueryOptions = {}): Promise<CategoryQueryResult> {
  const pool = getPool();
  const limit = options.limit ?? 12;
  const offset = options.offset ?? 0;
  const { where, params } = buildCategoryWhereClause({ type: options.type });

  try {
    const [rows] = await pool.query(
      `SELECT id, type, slug, name, short_description, long_description, hero_image_url, last_tidb_update_at, updated_at
        FROM categories
        WHERE ${where}
        ORDER BY name ASC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const parsed = z.array(categoryRecordSchema).safeParse(rows);
    if (!parsed.success) {
      console.error('[categories] failed to parse published categories', parsed.error.format(), options.requestId
        ? { requestId: options.requestId }
        : undefined);
      return { categories: [], totalCount: 0 };
    }

    const categories = parsed.data.map(normalizeCategoryRecord);

    const [countRows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM categories WHERE ${where}`,
      params
    );
    const total = Array.isArray(countRows) && countRows.length > 0 ? countRows[0]?.total : 0;

    return { categories, totalCount: normalizeCount(total) };
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] published categories query failed', info, options.requestId ? { requestId: options.requestId } : undefined);
    return { categories: [], totalCount: 0 };
  }
}

export async function getAllPublishedCategories(
  options: AllCategoriesQueryOptions = {}
): Promise<CategorySummary[]> {
  const batchSize = options.batchSize && options.batchSize > 0 ? Math.min(options.batchSize, 500) : 200;
  const categories: CategorySummary[] = [];
  let offset = 0;

  while (true) {
    const { categories: pageCategories, totalCount } = await getPublishedCategories({
      type: options.type,
      limit: batchSize,
      offset,
      requestId: options.requestId
    });

    if (pageCategories.length === 0) {
      break;
    }

    categories.push(...pageCategories);
    offset += pageCategories.length;

    if (offset >= totalCount || pageCategories.length < batchSize) {
      break;
    }
  }

  return categories;
}

export async function getPublishedCategoryPickerOptions(
  options: CategoryPickerOptions = {}
): Promise<CategoryPickerOption[]> {
  const pool = getPool();
  const { where, params } = buildCategoryWhereClause({ type: options.type });

  try {
    const [rows] = await pool.query(
      `SELECT type, slug, name
        FROM categories
        WHERE ${where}
        ORDER BY name ASC`,
      params
    );

    const parsed = z
      .array(
        z.object({
          type: z.string(),
          slug: z.string(),
          name: z.string()
        })
      )
      .safeParse(rows);

    if (!parsed.success) {
      console.error('[categories] failed to parse picker options', parsed.error.format(), options.requestId
        ? { requestId: options.requestId }
        : undefined);
      return [];
    }

    return parsed.data.map((item) => ({
      type: item.type.toLowerCase() === 'blog' ? 'blog' : 'product',
      slug: item.slug,
      name: item.name
    }));
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] picker options query failed', info, options.requestId ? { requestId: options.requestId } : undefined);
    return [];
  }
}

export async function categoryExistsByType(type: CategoryType, slug: string): Promise<boolean> {
  const pool = getPool();
  const synonyms = getCategoryTypeSynonyms(type);
  const placeholders = synonyms.map(() => '?').join(', ');

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT 1
        FROM categories
        WHERE slug = ? AND LOWER(type) IN (${placeholders})
        LIMIT 1`,
      [slug, ...synonyms]
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    console.error('[categories] exists query failed', toDbErrorInfo(error));
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
  try {
    const [rows] = await pool.query(
      `SELECT id, type, slug, name, short_description, long_description, hero_image_url, last_tidb_update_at, updated_at
        FROM categories
        WHERE slug = ? AND is_published = 1
        LIMIT 1`,
      [slug]
    );

    const parsed = z.array(categoryRecordSchema).safeParse(rows);
    if (!parsed.success || parsed.data.length === 0) {
      return null;
    }

    return normalizeCategoryRecord(parsed.data[0]!);
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] lookup by slug failed', info, options.requestId ? { requestId: options.requestId } : undefined);
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
    console.warn('[categories] failed to parse images_json', error);
  }
  return [];
}

function normalizeProductRecord(record: z.infer<typeof categoryProductRecordSchema>): CategoryProductSummary {
  const images = parseImages(record.images_json ?? null);
  const lastUpdated = record.updated_at || record.last_tidb_update_at || null;
  return {
    id: toBigInt(record.id),
    slug: record.slug,
    title: record.title_h1,
    shortSummary: toTrimmedOrNull(record.short_summary),
    price: toTrimmedOrNull(record.price),
    primaryImage: images.length > 0 ? images[0]! : null,
    lastUpdatedAt: lastUpdated && lastUpdated.trim().length > 0 ? lastUpdated : null
  };
}

// Build a robust match fragment for category columns, including JSON arrays or CSV text in `categories`.
interface CategoryMatchData {
  normalizedValues: string[];
  jsonValues: string[];
  csvTokens: string[];
}

function createCategoryMatchData(
  category: Pick<CategorySummary, 'slug' | 'name'>
): CategoryMatchData {
  const normalizedValues = new Set<string>();
  const jsonValues = new Set<string>();
  const csvTokens = new Set<string>();

  function registerCandidate(value: string | null | undefined) {
    if (typeof value !== 'string') {
      return;
    }
    const trimmed = value.trim();
    if (!trimmed) {
      return;
    }

    jsonValues.add(trimmed);

    const normalized = trimmed.toLowerCase();
    jsonValues.add(normalized);
    normalizedValues.add(normalized);

    const csv = normalized.replace(/\s+/g, '');
    if (csv) {
      csvTokens.add(csv);
    }
  }

  registerCandidate(category.slug);
  registerCandidate(category.name);

  if (typeof category.name === 'string' && category.name.trim()) {
    registerCandidate(slugifyCategoryName(category.name));
  }

  return {
    normalizedValues: Array.from(normalizedValues),
    jsonValues: Array.from(jsonValues),
    csvTokens: Array.from(csvTokens)
  };
}

function buildCategoryMatchFragments(
  columns: ProductCategoryColumn[],
  match: CategoryMatchData
): { where: string; params: unknown[] } {
  const pieces: string[] = [];
  const params: unknown[] = [];

  const hasVariants =
    variants.normalized.length > 0 || variants.raw.length > 0 || variants.collapsed.length > 0;

  if (columns.length === 0 || !hasVariants) {
    return { where: '0', params };
  }

  for (const column of columns) {
    if ((column === 'category' || column === 'category_slug') && match.normalizedValues.length > 0) {
      const equality = match.normalizedValues.map(() => 'LOWER(TRIM(??)) = ?').join(' OR ');
      pieces.push(`(${equality})`);
      for (const value of match.normalizedValues) {
        params.push(column, value);
      }
    } else if (column === 'categories' && (match.jsonValues.length > 0 || match.csvTokens.length > 0)) {
      const jsonFragments: string[] = [];
      const jsonParams: unknown[] = [];
      for (const value of match.jsonValues) {
        jsonFragments.push('JSON_CONTAINS(CAST(?? AS JSON), JSON_QUOTE(?))');
        jsonParams.push(column, value);
      }

      const csvFragments: string[] = [];
      const csvParams: unknown[] = [];
      for (const token of match.csvTokens) {
        csvFragments.push(`FIND_IN_SET(?, REPLACE(LOWER(TRIM(??)), ' ', '')) > 0`);
        csvParams.push(token, column);
        csvFragments.push(`CONCAT(',', REPLACE(LOWER(TRIM(??)), ' ', ''), ',') LIKE ?`);
        csvParams.push(column, `%,${token},%`);
      }

      const jsonClause = jsonFragments.length > 0 ? jsonFragments.join(' OR ') : '0';
      const csvClause = csvFragments.length > 0 ? csvFragments.join(' OR ') : '0';

      pieces.push(`(
        (JSON_VALID(??) AND (${jsonClause}))
        OR
        (NOT JSON_VALID(??) AND (${csvClause}))
      )`);

      params.push(column, ...jsonParams, column, ...csvParams);
    }
  }

  const where = pieces.length > 0 ? pieces.join(' OR ') : '0';
  return { where, params };
}

async function countProductsForCategory(
  category: Pick<CategorySummary, 'slug' | 'name'>,
  columns: ProductCategoryColumn[],
  match?: CategoryMatchData
): Promise<number> {
  if (columns.length === 0) {
    return 0;
  }

  const categoryMatch = match ?? createCategoryMatchData(category);
  if (
    categoryMatch.normalizedValues.length === 0 &&
    categoryMatch.jsonValues.length === 0 &&
    categoryMatch.csvTokens.length === 0
  ) {
    return 0;
  }

  const pool = getPool();
  const { where, params } = buildCategoryMatchFragments(columns, categoryMatch);

  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
        FROM products
        WHERE is_published = 1 AND (${where})`,
      params
    );
    const total = Array.isArray(rows) && rows.length > 0 ? rows[0]?.total : 0;
    return normalizeCount(total);
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] count products failed', info);
    return 0;
  }
}

export async function getPublishedProductsForCategory(
  category: Pick<CategorySummary, 'id' | 'slug' | 'name'>,
  options: CategoryProductsQueryOptions = {}
): Promise<CategoryProductsQueryResult> {
  const pool = getPool();
  const limit = options.limit ?? 10;
  const offset = options.offset ?? 0;
  const requestId = options.requestId;
  const columns = await getProductCategoryColumns(pool);
  if (columns.length === 0) {
    return { products: [], totalCount: 0 };
  }
  const match = createCategoryMatchData({ slug: category.slug, name: category.name });
  if (match.normalizedValues.length === 0 && match.jsonValues.length === 0 && match.csvTokens.length === 0) {
    return { products: [], totalCount: 0 };
  }

  const { where, params } = buildCategoryMatchFragments(columns, match);

  try {
    const [rows] = await pool.query(
      `SELECT id, slug, title_h1, short_summary, price, images_json, last_tidb_update_at, updated_at
        FROM products
        WHERE is_published = 1 AND (${where})
        ORDER BY title_h1 ASC
        LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const parsed = z.array(categoryProductRecordSchema).safeParse(rows);
    if (!parsed.success) {
      console.error('[categories] failed to parse products for category', parsed.error.format(), requestId
        ? { requestId }
        : undefined);
      return { products: [], totalCount: 0 };
    }

    const products = parsed.data.map(normalizeProductRecord);
    const totalCount = await countProductsForCategory({ slug: category.slug, name: category.name }, columns, match);

    return { products, totalCount };
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] products for category query failed', info, requestId ? { requestId } : undefined);
    return { products: [], totalCount: 0 };
  }
}

export interface CategorySitemapEntry {
  slug: string;
  type: CategoryType;
  lastUpdatedAt: string | null;
}

export async function getPublishedCategorySitemapEntries(): Promise<CategorySitemapEntry[]> {
  const pool = getPool();
  try {
    const [rows] = await pool.query(
      `SELECT id, type, slug, name, short_description, long_description, hero_image_url, last_tidb_update_at, updated_at
        FROM categories
        WHERE is_published = 1`
    );

    const parsed = z.array(categoryRecordSchema).safeParse(rows);
    if (!parsed.success) {
      console.error('[categories] failed to parse sitemap entries', parsed.error.format());
      return [];
    }

    return parsed.data.map((record) => {
      const summary = normalizeCategoryRecord(record);
      return {
        slug: summary.slug,
        type: summary.type,
        lastUpdatedAt: summary.lastUpdatedAt
      };
    });
  } catch (error) {
    const info = toDbErrorInfo(error);
    console.error('[categories] sitemap query failed', info);
    return [];
  }
}

export function resetCategoryColumnCaches(): void {
  cachedProductCategoryColumns = undefined;
}