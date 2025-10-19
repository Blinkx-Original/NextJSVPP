import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRequestId } from '@/lib/request-id';
import { getPublishedProductsForSitemap } from '@/lib/products';
import { getSiteUrl } from '@/lib/urls';
import { getCachedSitemap, setCachedSitemap } from '@/lib/sitemap-cache';
import {
  SITEMAP_PAGE_SIZE,
  computeChunkLastModified,
  renderSitemapIndexXml,
  type SitemapIndexEntry
} from '@/lib/sitemaps';

export const runtime = 'nodejs';

async function generateSitemapIndex(path: string): Promise<Response> {
  const requestId = createRequestId();
  const host = headers().get('host') ?? undefined;
  const siteUrl = getSiteUrl(host);

  const cached = getCachedSitemap(siteUrl, path, requestId);
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
    const entries: SitemapIndexEntry[] = [];
    let totalCount = 0;
    for (let pageIndex = 0; ; pageIndex++) {
      const offset = pageIndex * SITEMAP_PAGE_SIZE;
      const records = await getPublishedProductsForSitemap({
        requestId,
        limit: SITEMAP_PAGE_SIZE,
        offset
      });
      if (records.length === 0) {
        break;
      }

      totalCount += records.length;
      const pageNumber = pageIndex + 1;
      const loc = `${siteUrl}/sitemaps/sitemap-${pageNumber}.xml`;
      const lastmod = computeChunkLastModified(records);
      entries.push({ loc, lastmod });

      if (records.length < SITEMAP_PAGE_SIZE) {
        break;
      }
    }

    const xml = renderSitemapIndexXml(entries);
    setCachedSitemap(siteUrl, path, xml);
    const duration = Date.now() - startedAt;
    console.log(
      `[sitemap-index][${requestId}] entries=${entries.length} total=${totalCount} generated (${duration}ms)`
    );
    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(`[sitemap-index][${requestId}] error (${duration}ms)`, error);
    return NextResponse.json({ error: 'sitemap_error' }, { status: 500 });
  }
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname || '/sitemap.xml';
  return generateSitemapIndex(path);
}

export { generateSitemapIndex };
