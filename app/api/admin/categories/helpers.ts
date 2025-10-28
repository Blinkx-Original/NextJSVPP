import type { Pool, RowDataPacket } from 'mysql2/promise';
import { getCategoryTypeSynonyms } from '@/lib/categories';

type CategoryType = 'product' | 'blog';

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

function buildStatsJoin(type: CategoryType): { joinSql: string; selectCount: string } {
  if (type === 'product') {
    return {
      joinSql: `LEFT JOIN (
        SELECT slug, COUNT(*) AS total
        FROM (
          SELECT LOWER(
              COALESCE(
                NULLIF(p.category, ''),
                NULLIF(p.category_slug, '')
              )
            ) AS slug
          FROM products p
          WHERE p.is_published = 1
        ) normalized
        WHERE slug IS NOT NULL AND slug <> ''
        GROUP BY slug
      ) stats ON stats.slug = LOWER(c.slug)`,
      selectCount: 'COALESCE(stats.total, 0) AS products_count'
    };
  }

  return {
    joinSql: `LEFT JOIN (
      SELECT category_slug AS slug, COUNT(*) AS total
      FROM posts
      WHERE is_published = 1 AND category_slug IS NOT NULL
      GROUP BY category_slug
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
  const { joinSql, selectCount } = buildStatsJoin(type);

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

export function buildStatsClause(type: CategoryType): { joinSql: string; selectCount: string } {
  return buildStatsJoin(type);
}

export async function fetchAdminCategoryBySlug(
  pool: Pool,
  type: CategoryType,
  slug: string
): Promise<AdminCategoryRow | null> {
  const typeSynonyms = getCategoryTypeSynonyms(type);
  const placeholders = typeSynonyms.map(() => '?').join(', ');
  const { joinSql, selectCount } = buildStatsJoin(type);

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
