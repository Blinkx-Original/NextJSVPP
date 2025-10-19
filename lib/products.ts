import { z } from 'zod';
import { getPool } from './db';

const bigintLike = z.union([z.bigint(), z.number(), z.string()]);

const productSchema = z.object({
  id: bigintLike,
  slug: z.string(),
  title_h1: z.string(),
  brand: z.string().nullable(),
  model: z.string().nullable(),
  sku: z.string().nullable(),
  short_summary: z.string().nullable(),
  images_json: z.string().nullable(),
  desc_html: z.string().nullable(),
  cta_lead_url: z.string().nullable(),
  cta_stripe_url: z.string().nullable(),
  cta_affiliate_url: z.string().nullable(),
  cta_paypal_url: z.string().nullable(),
  is_published: z.number().or(z.boolean()),
  last_tidb_update_at: z.string().nullable()
});

export type ProductRecord = z.infer<typeof productSchema>;

export type RawProductRecord = Record<string, any>;

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

export async function getProductRecordBySlug(slug: string): Promise<RawProductRecord | null> {
  const pool = getPool();
  const [rows] = await pool.query('SELECT * FROM products WHERE slug = ? LIMIT 1', [slug]);
  if (!Array.isArray(rows) || rows.length === 0) {
    return null;
  }
  return rows[0] as RawProductRecord;
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
