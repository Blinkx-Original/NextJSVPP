import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import type { ResultSetHeader } from 'mysql2/promise';
import { getPool } from '@/lib/db';
import { clearProductCache } from '@/lib/products';
import { clearSitemapCache } from '@/lib/sitemap-cache';
import { setLastPublishedBatch } from '@/lib/publish-state';
import {
  getCloudflareCredentials,
  buildSitemapPurgeList,
  purgeFiles,
  abbreviateZoneId
} from '@/lib/cloudflare';

export const runtime = 'nodejs';

interface PublishRequest {
  slug?: unknown;
}

/**
 * Publish a single product and purge Cloudflare caches for sitemap files.
 * This endpoint performs the same actions as publish-product, then builds
 * a list of sitemap URLs and purges them from Cloudflare if credentials
 * are present. It returns a summary of the purge operation.
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
    const [result] = await connection.query<ResultSetHeader>(
      'UPDATE products SET is_published = 1, last_tidb_update_at = NOW() WHERE slug = ? LIMIT 1',
      [slug]
    );
    const affected = typeof (result as ResultSetHeader).affectedRows === 'number'
      ? (result as ResultSetHeader).affectedRows
      : 0;
    if (affected === 0) {
      return NextResponse.json(
        { ok: false, slug, message: 'Producto no encontrado o ya estaba publicado.' },
        { status: 404 }
      );
    }
    // Clear caches and revalidate
    clearProductCache(slug);
    clearSitemapCache();
    revalidatePath(`/p/${slug}`);
    revalidatePath('/sitemap.xml');
    revalidatePath('/sitemap_index.xml');
    revalidatePath('/sitemaps/[sitemap]');
    // Remember this slug for purge
    setLastPublishedBatch([slug]);

    // Prepare Cloudflare summary
    let cloudflareSummary: {
      configured: boolean;
      ok: boolean;
      error_code?: string | null;
      urls_purged?: number;
      purged?: string[];
      zone_id?: string;
      zone_id_short?: string;
      ray_ids?: string[];
      error_details?: unknown;
    } = { configured: false, ok: false };

    const credentials = getCloudflareCredentials();
    if (credentials) {
      try {
        const list = await buildSitemapPurgeList(request);
        const purgeResult = await purgeFiles(credentials, list.urls, { label: 'sitemaps' });
        cloudflareSummary = {
          configured: true,
          ok: purgeResult.ok,
          error_code: purgeResult.ok ? null : purgeResult.errorCode ?? 'api_error',
          urls_purged: list.urls.length,
          purged: purgeResult.ok ? list.labels : undefined,
          zone_id: credentials.zoneId,
          zone_id_short: abbreviateZoneId(credentials.zoneId),
          ray_ids: purgeResult.rayIds
        };
      } catch (error) {
        cloudflareSummary = {
          configured: true,
          ok: false,
          error_code: 'purge_failed',
          error_details: error instanceof Error ? { message: error.message } : undefined
        };
      }
    } else {
      cloudflareSummary = { configured: false, ok: false };
    }

    const messageParts: string[] = [`Producto publicado correctamente.`];
    if (cloudflareSummary) {
      if (!cloudflareSummary.configured) {
        messageParts.push('Cloudflare: purga deshabilitada (sin credenciales).');
      } else if (cloudflareSummary.ok) {
        const urlsPurged = cloudflareSummary.urls_purged ?? 0;
        if (urlsPurged > 0) {
          messageParts.push(`Cloudflare: purga exitosa de ${urlsPurged} URL${urlsPurged === 1 ? '' : 's'}.`);
        } else {
          messageParts.push('Cloudflare: purga exitosa.');
        }
      } else {
        const code = cloudflareSummary.error_code ?? 'error_desconocido';
        messageParts.push(`Cloudflare: error al purgar (${code}).`);
      }
    }

    return NextResponse.json({
      ok: true,
      slug,
      message: messageParts.join(' '),
      cloudflare: cloudflareSummary
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, slug, message: (error as Error)?.message ?? 'Error publicando y purgando.' },
      { status: 500 }
    );
  } finally {
    connection.release();
  }
}