import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRequestId } from '@/lib/request-id';
import { getPublishedProductsForSitemap, type SitemapProductRecord } from '@/lib/products';
import { getSiteUrl } from '@/lib/urls';
import { getCachedSitemap, setCachedSitemap } from '@/lib/sitemap-cache';

export const runtime = 'nodejs';

function toIsoDate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function resolveLastModified(record: SitemapProductRecord): string {
  const candidates = [record.last_tidb_update_at, record.updated_at];
  for (const candidate of candidates) {
    const iso = toIsoDate(typeof candidate === 'string' ? candidate : null);
    if (iso) {
      return iso;
    }
  }
  return new Date().toISOString();
}

function renderSitemapXml(siteUrl: string, records: SitemapProductRecord[]): string {
  const urls = records
    .map((record) => {
      const lastmod = resolveLastModified(record);
      return `  <url>\n    <loc>${siteUrl}/p/${record.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    })
    .join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

export async function GET(): Promise<Response> {
  const requestId = createRequestId();
  const host = headers().get('host') ?? undefined;
  const siteUrl = getSiteUrl(host);

  const cached = getCachedSitemap(siteUrl, requestId);
  if (cached) {
    return new Response(cached, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  }

  const startedAt = Date.now();
  try {
    const records = await getPublishedProductsForSitemap({ requestId });
    const xml = renderSitemapXml(siteUrl, records);
    setCachedSitemap(siteUrl, xml);
    const duration = Date.now() - startedAt;
    console.log(`[sitemap][${requestId}] urls=${records.length} generated (${duration}ms)`);
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(`[sitemap][${requestId}] error (${duration}ms)`, error);
    return NextResponse.json({ error: 'sitemap_error' }, { status: 500 });
  }
}
