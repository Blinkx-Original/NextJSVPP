import type { Pool, PoolConnection, RowDataPacket } from 'mysql2/promise';
import {
  buildProductCategoryMatchClause,
  getCategoryTypeSynonyms,
  getProductCategoryColumns
} from '@/lib/categories';
import { toDbErrorInfo } from '@/lib/db';

type CategoryType = 'product' | 'blog';

export type BlogCategoryColumn = 'category_slug' | 'category';

let cachedBlogCategoryColumn: BlogCategoryColumn | null | undefined;

async function detectBlogCategoryColumn(
  client: Pool | PoolConnection
): Promise<BlogCategoryColumn | null> {
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
      console.warn('[admin/categories] failed to inspect blog posts column', info);
    }
  }

  cachedBlogCategoryColumn = null;
  return null;
}

export async function getBlogCategoryColumn(
  client: Pool | PoolConnection
): Promise<BlogCategoryColumn | null> {
  return detectBlogCategoryColumn(client);
}

export interface AdminCategoryRow {
  id: string;
  type: CategoryType;
  slug: string;
  name: string;
  short_description: string | null;
  long_description: string | null;
  hero_image_url: string | null;
  is_published: boolean;
  products_count: number;
  updated_at: string | null;
}

function buildStatsJoin(
  type: CategoryType,
  options: { blogColumn?: BlogCategoryColumn | null } = {}
): { joinSql: string; selectCount: string } {
  if (type === 'product') {
    return {
      joinSql: `LEFT JOIN (
        SELECT category AS slug, COUNT(*) AS total
        FROM products
        WHERE is_published = 1 AND category IS NOT NULL AND category <> ''
        GROUP BY category
      ) stats ON stats.slug = c.slug`,
      selectCount: 'COALESCE(stats.total, 0) AS products_count'
    };
  }

  const column = options.blogColumn ?? 'category_slug';

  if (!column) {
    return {
      joinSql: '',
      selectCount: '0 AS products_count'
    };
  }

  return {
    joinSql: `LEFT JOIN (
      SELECT \`${column}\` AS slug, COUNT(*) AS total
      FROM posts
      WHERE is_published = 1 AND \`${column}\` IS NOT NULL AND \`${column}\` <> ''
      GROUP BY \`${column}\`
    ) stats ON stats.slug = c.slug`,
    selectCount: 'COALESCE(stats.total, 0) AS products_count'
  };
}

export function mapAdminCategoryRow(row: RowDataPacket, type: CategoryType): AdminCategoryRow {
  const idValue = row.id;
  const id = typeof idValue === 'bigint' ? idValue.toString() : String(idValue);
  const productsCountRaw = row.products_count;
  const productsCount = Number.parseInt(String(productsCountRaw ?? '0'), 10);
  return {
    id,
    type,
    slug: typeof row.slug === 'string' ? row.slug : '',
    name: typeof row.name === 'string' ? row.name : '',
    short_description: typeof row.short_description === 'string' ? row.short_description : null,
    long_description: typeof row.long_description === 'string' ? row.long_description : null,
    hero_image_url: typeof row.hero_image_url === 'string' ? row.hero_image_url : null,
    is_published: Boolean(row.is_published),
    products_count: Number.isFinite(productsCount) && productsCount > 0 ? productsCount : 0,
    updated_at: typeof row.updated_at === 'string' && row.updated_at ? row.updated_at : null
  };
}

export async function fetchAdminCategoryById(
  pool: Pool,
  type: CategoryType,
  id: number
): Promise<AdminCategoryRow | null> {
  const typeSynonyms = getCategoryTypeSynonyms(type);
  const placeholders = typeSynonyms.map(() => '?').join(', ');
  const blogColumn = type === 'blog' ? await getBlogCategoryColumn(pool) : null;
  const { joinSql, selectCount } = buildStatsJoin(type, { blogColumn });

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.type, c.slug, c.name, c.short_description, c.long_description, c.hero_image_url,
        c.is_published, c.updated_at, ${selectCount}
      FROM categories c
      ${joinSql}
      WHERE c.id = ? AND LOWER(c.type) IN (${placeholders})
      LIMIT 1`,
    [id, ...typeSynonyms]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return mapAdminCategoryRow(rows[0] as RowDataPacket, type);
}

export function buildStatsClause(
  type: CategoryType,
  options: { blogColumn?: BlogCategoryColumn | null } = {}
): { joinSql: string; selectCount: string } {
  return buildStatsJoin(type, options);
}

export async function fetchAdminCategoryBySlug(
  pool: Pool,
  type: CategoryType,
  slug: string
): Promise<AdminCategoryRow | null> {
  const typeSynonyms = getCategoryTypeSynonyms(type);
  const placeholders = typeSynonyms.map(() => '?').join(', ');
  const blogColumn = type === 'blog' ? await getBlogCategoryColumn(pool) : null;
  const { joinSql, selectCount } = buildStatsJoin(type, { blogColumn });

  const [rows] = await pool.query<RowDataPacket[]>(
    `SELECT c.id, c.type, c.slug, c.name, c.short_description, c.long_description, c.hero_image_url,
        c.is_published, c.updated_at, ${selectCount}
      FROM categories c
      ${joinSql}
      WHERE c.slug = ? AND LOWER(c.type) IN (${placeholders})
      LIMIT 1`,
    [slug, ...typeSynonyms]
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }

  return mapAdminCategoryRow(rows[0] as RowDataPacket, type);
}

export async function countCategoryRelations(
  connection: PoolConnection,
  type: CategoryType,
  slug: string,
  blogColumnOverride?: BlogCategoryColumn | null
): Promise<number> {
  if (type === 'product') {
    const columns = await getProductCategoryColumns(connection);
    const match = buildProductCategoryMatchClause(columns, [slug]);
    if (!match) {
      return 0;
    }

    const [rows] = await connection.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total
        FROM products
        WHERE is_published = 1 AND ${match.clause}`,
      match.params
    );
    const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
    const value = row ? row.total : 0;
    const total = Number.isFinite(value) ? Number(value) : Number.parseInt(String(value ?? '0'), 10);
    return Number.isFinite(total) && total > 0 ? total : 0;
  }

  const blogColumn =
    blogColumnOverride !== undefined ? blogColumnOverride : await getBlogCategoryColumn(connection);
  if (!blogColumn) {
    return 0;
  }

  const [rows] = await connection.query<RowDataPacket[]>(
    `SELECT COUNT(*) AS total
      FROM posts
      WHERE \`${blogColumn}\` = ? AND is_published = 1`,
    [slug]
  );
  const row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
  const value = row ? row.total : 0;
  const total = Number.isFinite(value) ? Number(value) : Number.parseInt(String(value ?? '0'), 10);
  return Number.isFinite(total) && total > 0 ? total : 0;
}
