import { z } from 'zod';
import type { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { getPool, toDbErrorInfo } from './db';
import { getBlogCategoryColumn, type BlogCategoryColumn } from './categories';

const BLOG_POST_SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MAX_LENGTH = 160;
const CATEGORY_SLUG_MAX_LENGTH = 120;
const TITLE_MAX_LENGTH = 200;
const SUMMARY_MAX_LENGTH = 160;
const URL_MAX_LENGTH = 2048;
export const SEO_TITLE_MAX_LENGTH = 60;
export const SEO_DESCRIPTION_MAX_LENGTH = 160;

const bigintLike = z.union([z.bigint(), z.number(), z.string()]);

const dateLike = z.union([z.string(), z.date(), z.null()]);

const blogPostRowSchema = z.object({
  id: bigintLike,
  slug: z.string(),
  title_h1: z.string().nullable(),
  short_summary: z.string().nullable().optional(),
  content_html: z.string().nullable().optional(),
  cover_image_url: z.string().nullable().optional(),
  category_slug: z.string().nullable().optional(),
  product_slugs_json: z.any().nullable().optional(),
  cta_lead_url: z.string().nullable().optional(),
  cta_affiliate_url: z.string().nullable().optional(),
  seo_title: z.string().nullable().optional(),
  seo_description: z.string().nullable().optional(),
  canonical_url: z.string().nullable().optional(),
  is_published: z.union([z.boolean(), z.number()]),
  published_at: dateLike.optional(),
  last_tidb_update_at: dateLike.optional(),
  created_at: z.string().nullable().optional(),
  updated_at: z.string().nullable().optional()
});

const blogPostListRowSchema = blogPostRowSchema.pick({
  id: true,
  slug: true,
  title_h1: true,
  short_summary: true,
  category_slug: true,
  is_published: true,
  published_at: true,
  last_tidb_update_at: true
});

export type BlogPostRow = z.infer<typeof blogPostRowSchema>;
export type BlogPostListRow = z.infer<typeof blogPostListRowSchema>;

export interface BlogPostSummary {
  id: bigint;
  slug: string;
  title: string | null;
  shortSummary: string | null;
  categorySlug: string | null;
  isPublished: boolean;
  publishedAt: string | null;
  isPublic: boolean;
  lastUpdatedAt: string | null;
}

export interface BlogPostDetail extends BlogPostSummary {
  contentHtml: string | null;
  coverImageUrl: string | null;
  productSlugs: string[];
  ctaLeadUrl: string | null;
  ctaAffiliateUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
}

export interface BlogPostQueryOptions {
  limit?: number;
  cursor?: number;
  query?: string;
  category?: string;
}

export interface BlogPostQueryResult {
  posts: BlogPostSummary[];
  nextCursor: number | null;
}

export interface BlogPostWritePayload {
  slug: string;
  title: string;
  shortSummary: string | null;
  contentHtml: string | null;
  coverImageUrl: string | null;
  categorySlug: string | null;
  productSlugs: string[];
  ctaLeadUrl: string | null;
  ctaAffiliateUrl: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  canonicalUrl: string | null;
  isPublished: boolean;
  publishedAt: Date | null;
}

type SqlClient = Pool | PoolConnection;

interface BlogSchema {
  categoryColumn: BlogCategoryColumn | null;
}

let cachedBlogSchema: BlogSchema | undefined;
let missingCategoryFilterWarningShown = false;

async function getBlogSchema(client?: SqlClient): Promise<BlogSchema> {
  if (cachedBlogSchema) {
    return cachedBlogSchema;
  }

  const provider = client ?? getPool();
  const categoryColumn = await getBlogCategoryColumn(provider);
  const schema: BlogSchema = { categoryColumn };
  cachedBlogSchema = schema;
  return schema;
}

function buildCategorySelect(schema: BlogSchema): string {
  if (schema.categoryColumn === 'category') {
    return 'posts.category AS category_slug';
  }
  if (schema.categoryColumn === 'category_slug') {
    return 'posts.category_slug';
  }
  return 'NULL AS category_slug';
}

function applyCategoryFilter(
  schema: BlogSchema,
  category: string | undefined,
  where: string[],
  params: unknown[]
): void {
  if (!category) {
    return;
  }
  if (!schema.categoryColumn) {
    if (!missingCategoryFilterWarningShown) {
      console.warn('[blog-posts] category filter requested but posts table has no category column');
      missingCategoryFilterWarningShown = true;
    }
    return;
  }
  where.push(`posts.\`${schema.categoryColumn}\` = ?`);
  params.push(category);
}

interface InsertStatement {
  sql: string;
  values: unknown[];
}

function buildInsertStatement(schema: BlogSchema, payload: BlogPostWritePayload): InsertStatement {
  const columns: string[] = [
    'slug',
    'title_h1',
    'short_summary',
    'content_html',
    'cover_image_url'
  ];
  const placeholders: string[] = ['?', '?', '?', '?', '?'];
  const values: unknown[] = [
    payload.slug,
    payload.title,
    payload.shortSummary,
    payload.contentHtml,
    payload.coverImageUrl
  ];

  if (schema.categoryColumn) {
    columns.push(schema.categoryColumn);
    placeholders.push('?');
    values.push(payload.categorySlug);
  }

  columns.push('product_slugs_json');
  placeholders.push('?');
  values.push(toJson(payload.productSlugs));

  columns.push('cta_lead_url');
  placeholders.push('?');
  values.push(payload.ctaLeadUrl);

  columns.push('cta_affiliate_url');
  placeholders.push('?');
  values.push(payload.ctaAffiliateUrl);

  columns.push('seo_title');
  placeholders.push('?');
  values.push(payload.seoTitle);

  columns.push('seo_description');
  placeholders.push('?');
  values.push(payload.seoDescription);

  columns.push('canonical_url');
  placeholders.push('?');
  values.push(payload.canonicalUrl);

  columns.push('is_published');
  placeholders.push('?');
  values.push(payload.isPublished ? 1 : 0);

  columns.push('published_at');
  placeholders.push('?');
  values.push(payload.publishedAt);

  const quotedColumns = columns.map((column) => `\`${column}\``);
  const sql = `INSERT INTO posts (${quotedColumns.join(', ')}) VALUES (${placeholders.join(', ')})`;

  return { sql, values };
}


interface UpdateStatement {
  sql: string;
  values: unknown[];
}

function buildUpdateStatement(
  schema: BlogSchema,
  payload: BlogPostWritePayload,
  currentSlug: string
): UpdateStatement {
  const assignments: string[] = [
    'slug = ?',
    'title_h1 = ?',
    'short_summary = ?',
    'content_html = ?',
    'cover_image_url = ?'
  ];
  const values: unknown[] = [
    payload.slug,
    payload.title,
    payload.shortSummary,
    payload.contentHtml,
    payload.coverImageUrl
  ];

  if (schema.categoryColumn) {
    assignments.push(`\`${schema.categoryColumn}\` = ?`);
    values.push(payload.categorySlug);
  }

  assignments.push('product_slugs_json = ?');
  values.push(toJson(payload.productSlugs));

  assignments.push('cta_lead_url = ?');
  values.push(payload.ctaLeadUrl);

  assignments.push('cta_affiliate_url = ?');
  values.push(payload.ctaAffiliateUrl);

  assignments.push('seo_title = ?');
  values.push(payload.seoTitle);

  assignments.push('seo_description = ?');
  values.push(payload.seoDescription);

  assignments.push('canonical_url = ?');
  values.push(payload.canonicalUrl);

  assignments.push('is_published = ?');
  values.push(payload.isPublished ? 1 : 0);

  assignments.push('published_at = ?');
  values.push(payload.publishedAt);

  const sql = `UPDATE posts
    SET ${assignments.join(', ')}, last_tidb_update_at = NOW(6)
    WHERE slug = ?
    LIMIT 1`;

  values.push(currentSlug);

  return { sql, values };
}

async function runInTransaction<T>(
  context: 'insert' | 'update',
  handler: (connection: PoolConnection, schema: BlogSchema) => Promise<T>
): Promise<T> {
  const connection = await getPool().getConnection();
  let inTransaction = false;
  try {
    await connection.beginTransaction();
    inTransaction = true;
    const schema = await getBlogSchema(connection);
    const result = await handler(connection, schema);
    await connection.commit();
    inTransaction = false;
    return result;
  } catch (error) {
    if (inTransaction) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        console.error(
          `[blog-posts] rollback error after ${context}`,
          toDbErrorInfo(rollbackError)
        );
      }
    }
    throw error;
  } finally {
    connection.release();
  }
}

function toBigInt(value: z.infer<typeof bigintLike>): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    return BigInt(value);
  }
  return BigInt(value);
}

function normalizeBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    return value !== 0;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === '1' || normalized === 'true' || normalized === 'yes') {
      return true;
    }
    if (normalized === '0' || normalized === 'false' || normalized === 'no') {
      return false;
    }
  }
  return false;
}

function normalizeProductSlug(value: string): string | null {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > SLUG_MAX_LENGTH || !BLOG_POST_SLUG_REGEX.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function parseProductSlugs(input: unknown): string[] {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? normalizeProductSlug(item) : null))
      .filter((item): item is string => Boolean(item));
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      return parseProductSlugs(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

function toJson(value: unknown): string | null {
  if (!value) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
}

function toIsoString(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  return null;
}

function calculateIsPublic(record: Pick<BlogPostRow, 'is_published' | 'published_at'>): boolean {
  const isPublished = normalizeBoolean(record.is_published);
  if (!isPublished) {
    return false;
  }
  if (!record.published_at) {
    return false;
  }
  const timestamp = new Date(record.published_at);
  if (Number.isNaN(timestamp.getTime())) {
    return false;
  }
  return timestamp.getTime() <= Date.now();
}

function normalizeSummary(record: BlogPostListRow): BlogPostSummary {
  return {
    id: toBigInt(record.id),
    slug: record.slug,
    title: record.title_h1 ?? null,
    shortSummary: record.short_summary ?? null,
    categorySlug: record.category_slug ?? null,
    isPublished: normalizeBoolean(record.is_published),
    publishedAt: toIsoString(record.published_at),
    isPublic: calculateIsPublic(record),
    lastUpdatedAt: toIsoString(record.last_tidb_update_at)
  };
}

function normalizeDetail(record: BlogPostRow): BlogPostDetail {
  const summary = normalizeSummary(record);
  const productSlugs = parseProductSlugs(record.product_slugs_json);
  return {
    ...summary,
    contentHtml: record.content_html ?? null,
    coverImageUrl: record.cover_image_url ?? null,
    productSlugs,
    ctaLeadUrl: record.cta_lead_url ?? null,
    ctaAffiliateUrl: record.cta_affiliate_url ?? null,
    seoTitle: record.seo_title ?? null,
    seoDescription: record.seo_description ?? null,
    canonicalUrl: record.canonical_url ?? null
  };
}

export async function queryBlogPosts(options: BlogPostQueryOptions = {}): Promise<BlogPostQueryResult> {
  const limit = Math.min(Math.max(options.limit ?? 20, 1), 50);
  const where: string[] = [];
  const params: unknown[] = [];
  const pool = getPool();
  const schema = await getBlogSchema(pool);

  if (typeof options.cursor === 'number' && Number.isFinite(options.cursor) && options.cursor > 0) {
    where.push('posts.id < ?');
    params.push(options.cursor);
  }

  if (options.query) {
    const term = `%${options.query.trim()}%`;
    where.push('(posts.slug LIKE ? OR posts.title_h1 LIKE ? OR posts.short_summary LIKE ? )');
    params.push(term, term, term);
  }

  const normalizedCategory = options.category?.trim();
  applyCategoryFilter(schema, normalizedCategory, where, params);

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';
  const categorySelect = buildCategorySelect(schema);
  const sql = `SELECT posts.id, posts.slug, posts.title_h1, posts.short_summary, ${categorySelect}, posts.is_published, posts.published_at, posts.last_tidb_update_at
    FROM posts
    ${whereClause}
    ORDER BY posts.id DESC
    LIMIT ?`;

  params.push(limit + 1);

  try {
    const [rows] = await pool.query<RowDataPacket[]>(sql, params);
    const parsed = blogPostListRowSchema.array().safeParse(rows);
    if (!parsed.success) {
      console.error('[blog-posts] failed to parse list rows', parsed.error.format());
      return { posts: [], nextCursor: null };
    }

    const items = parsed.data.map(normalizeSummary);
    let nextCursor: number | null = null;

    if (items.length > limit) {
      const next = items.pop();
      if (next) {
        nextCursor = Number(next.id);
      }
    }

    return { posts: items, nextCursor };
  } catch (error) {
    console.error('[blog-posts] query error', toDbErrorInfo(error));
    return { posts: [], nextCursor: null };
  }
}

type QueryExecutor = Pick<PoolConnection, 'query'>;

function parseBlogPostDetailRows(rows: RowDataPacket[]): BlogPostDetail | null {
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  const parsed = blogPostRowSchema.safeParse(rows[0]);
  if (!parsed.success) {
    console.error('[blog-posts] failed to parse detail row', parsed.error.format());
    return null;
  }
  return normalizeDetail(parsed.data);
}

async function loadBlogPostBySlug(
  slug: string,
  schema: BlogSchema,
  executor: QueryExecutor
): Promise<BlogPostDetail | null> {
  const categorySelect = buildCategorySelect(schema);
  const sql = `SELECT posts.id, posts.slug, posts.title_h1, posts.short_summary, posts.content_html, posts.cover_image_url,
      ${categorySelect}, posts.product_slugs_json, posts.cta_lead_url, posts.cta_affiliate_url, posts.seo_title,
      posts.seo_description, posts.canonical_url, posts.is_published, posts.published_at, posts.last_tidb_update_at
    FROM posts
    WHERE posts.slug = ?
    LIMIT 1`;
  try {
    const [rows] = await executor.query<RowDataPacket[]>(sql, [slug]);
    return parseBlogPostDetailRows(rows);
  } catch (error) {
    console.error('[blog-posts] query error', toDbErrorInfo(error));
    return null;
  }
}

export async function findBlogPostBySlug(slug: string): Promise<BlogPostDetail | null> {
  const pool = getPool();
  const schema = await getBlogSchema(pool);
  return loadBlogPostBySlug(slug, schema, pool);
}

export interface BlogPostWriteResult {
  ok: boolean;
  post?: BlogPostDetail;
  error?: { code: 'duplicate_slug' | 'sql_error'; message?: string; info?: unknown };
}

function normalizeUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, URL_MAX_LENGTH);
}

function normalizeSummaryText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > maxLength) {
    return trimmed.slice(0, maxLength);
  }
  return trimmed;
}

export function normalizeBlogSlug(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('invalid_slug');
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed || trimmed.length > SLUG_MAX_LENGTH || !BLOG_POST_SLUG_REGEX.test(trimmed)) {
    throw new Error('invalid_slug');
  }
  return trimmed;
}

export function normalizeBlogTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('invalid_title');
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > TITLE_MAX_LENGTH) {
    throw new Error('invalid_title');
  }
  return trimmed;
}

export function normalizeSeoField(value: unknown, maxLength: number): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('invalid_seo');
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed.length > maxLength) {
    throw new Error('invalid_seo');
  }
  return trimmed;
}

export function normalizePublishedAt(value: unknown): Date | null {
  if (value == null || value === '') {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error('invalid_published_at');
    }
    return parsed;
  }
  throw new Error('invalid_published_at');
}

function normalizeCategorySlug(value: unknown): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new Error('invalid_category');
  }
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  if (trimmed.length > CATEGORY_SLUG_MAX_LENGTH || !BLOG_POST_SLUG_REGEX.test(trimmed)) {
    throw new Error('invalid_category');
  }
  return trimmed;
}

export function normalizeBlogWritePayload(payload: Record<string, unknown>): BlogPostWritePayload {
  const slug = normalizeBlogSlug(payload.slug);
  const title = normalizeBlogTitle(payload.title_h1 ?? payload.title);
  const shortSummary = normalizeSummaryText(payload.short_summary ?? payload.shortSummary, SUMMARY_MAX_LENGTH);
  const contentHtml = typeof payload.content_html === 'string' ? payload.content_html : typeof payload.contentHtml === 'string' ? payload.contentHtml : null;
  const coverImageUrl = normalizeUrl(payload.cover_image_url ?? payload.coverImageUrl);
  const categorySlug = normalizeCategorySlug(payload.category_slug ?? payload.categorySlug);
  const productSlugs = parseProductSlugs(payload.product_slugs_json ?? payload.product_slugs ?? payload.productSlugs);
  const ctaLeadUrl = normalizeUrl(payload.cta_lead_url ?? payload.ctaLeadUrl);
  const ctaAffiliateUrl = normalizeUrl(payload.cta_affiliate_url ?? payload.ctaAffiliateUrl);
  const seoTitle = normalizeSeoField(payload.seo_title ?? payload.seoTitle, SEO_TITLE_MAX_LENGTH);
  const seoDescription = normalizeSeoField(
    payload.seo_description ?? payload.seoDescription,
    SEO_DESCRIPTION_MAX_LENGTH
  );
  const canonicalUrl = normalizeUrl(payload.canonical_url ?? payload.canonicalUrl);
  const isPublished = normalizeBoolean(payload.is_published ?? payload.isPublished);
  let publishedAt = normalizePublishedAt(payload.published_at ?? payload.publishedAt);

  if (isPublished && !publishedAt) {
    publishedAt = new Date();
  }

  return {
    slug,
    title,
    shortSummary,
    contentHtml,
    coverImageUrl,
    categorySlug,
    productSlugs,
    ctaLeadUrl,
    ctaAffiliateUrl,
    seoTitle,
    seoDescription,
    canonicalUrl,
    isPublished,
    publishedAt
  };
}

export async function insertBlogPost(payload: BlogPostWritePayload): Promise<BlogPostWriteResult> {
  try {
    const post = await runInTransaction('insert', async (connection, schema) => {
      const statement = buildInsertStatement(schema, payload);
      const [result] = await connection.query<ResultSetHeader>(statement.sql, statement.values);
      if (!result.insertId) {
        throw new Error('insert_failed');
      }

      const created = await loadBlogPostBySlug(payload.slug, schema, connection);
      if (!created) {
        throw new Error('load_failed');
      }

      return created;
    });

    return { ok: true, post };
  } catch (error) {
    const message = (error as Error)?.message;
    if (message === 'load_failed') {
      return { ok: false, error: { code: 'sql_error', message: 'Unable to load created post' } };
    }
    if (message === 'insert_failed') {
      return { ok: false, error: { code: 'sql_error', message: 'Unable to create post' } };
    }

    const info = toDbErrorInfo(error);
    if (info.code === 'ER_DUP_ENTRY' || info.code === '23505') {
      return { ok: false, error: { code: 'duplicate_slug', message: info.message, info } };
    }

    console.error('[blog-posts] insert error', info);
    return { ok: false, error: { code: 'sql_error', message: info.message, info } };
  }
}

export async function updateBlogPost(
  currentSlug: string,
  payload: BlogPostWritePayload
): Promise<BlogPostWriteResult> {
  try {
    const post = await runInTransaction('update', async (connection, schema) => {
      const statement = buildUpdateStatement(schema, payload, currentSlug);
      const [result] = await connection.query<ResultSetHeader>(statement.sql, statement.values);
      if (result.affectedRows === 0) {
        throw new Error('not_found');
      }

      const updated = await loadBlogPostBySlug(payload.slug, schema, connection);
      if (!updated) {
        throw new Error('load_failed');
      }

      return updated;
    });

    return { ok: true, post };
  } catch (error) {
    const message = (error as Error)?.message;
    if (message === 'not_found') {
      return { ok: false, error: { code: 'sql_error', message: 'Post not found' } };
    }
    if (message === 'load_failed') {
      return { ok: false, error: { code: 'sql_error', message: 'Unable to load updated post' } };
    }

    const info = toDbErrorInfo(error);
    if (info.code === 'ER_DUP_ENTRY' || info.code === '23505') {
      return { ok: false, error: { code: 'duplicate_slug', message: info.message, info } };
    }

    console.error('[blog-posts] update error', info);
    if ((error as Error)?.message === 'load_failed') {
      return { ok: false, error: { code: 'sql_error', message: 'Unable to load updated post' } };
    }
    return { ok: false, error: { code: 'sql_error', message: info.message, info } };
  }
}
