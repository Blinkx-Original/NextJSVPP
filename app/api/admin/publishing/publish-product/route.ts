import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { ResultSetHeader } from 'mysql2/promise';
import { getPool } from '@/lib/db';
import { clearProductCache } from '@/lib/products';
import { clearSitemapCache } from '@/lib/sitemap-cache';
import { setLastPublishedBatch } from '@/lib/publish-state';

export const runtime = 'nodejs';

interface PublishRequest {
  slug?: unknown;
}

/**
 * Publish a single product by slug.
 * This endpoint sets `is_published` to 1 and updates the `last_tidb_update_at` timestamp.
 * It also clears the product and sitemap caches, revalidates the product page and sitemap routes,
 * and records the slug as the last published batch. It does not trigger any Cloudflare purge.
 */
export async function POST(request: NextRequest) {
  let payload: PublishRequest = {};
  try {
    payload = (await request.json()) as PublishRequest;
  } catch {
    payload = {};
  }
  const slugInput = typeof payload.slug === 'string' ? payload.slug : null;
  const slug = slugInput?.trim() || '';
  if (!slug) {
    return NextResponse.json({ ok: false, message: 'El campo slug es obligatorio.' }, { status: 400 });
  }
  const pool = getPool();
  const connection = await pool.getConnection();
  try {
    // Update the product if it exists. Use LIMIT 1 to avoid accidental mass updates.
    const [result] = await connection.query<ResultSetHeader>(
      'UPDATE products SET is_published = 1, last_tidb_update_at = NOW() WHERE slug = ? LIMIT 1',
      [slug]
    );
    const affected = typeof (result as ResultSetHeader).affectedRows === 'number'
      ? (result as ResultSetHeader).affectedRows
      : 0;
    if (affected > 0) {
      // Clear caches and revalidate paths
      clearProductCache(slug);
      clearSitemapCache();
      revalidatePath(`/p/${slug}`);
      revalidatePath('/sitemap.xml');
      revalidatePath('/sitemap_index.xml');
      revalidatePath('/sitemaps/[sitemap]');
      // Remember this slug for potential Cloudflare purge
      setLastPublishedBatch([slug]);
      return NextResponse.json({ ok: true, slug, message: 'Producto publicado correctamente.' });
    }
    // No rows updated means product does not exist or is already published
    return NextResponse.json(
      { ok: false, slug, message: 'Producto no encontrado o ya estaba publicado.' },
      { status: 404 }
    );
  } catch (error) {
    return NextResponse.json(
      { ok: false, slug, message: (error as Error)?.message ?? 'Error publicando el producto.' },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}