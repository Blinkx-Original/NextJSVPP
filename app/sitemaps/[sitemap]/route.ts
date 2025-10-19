import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRequestId } from '@/lib/request-id';
import { getPublishedProductsForSitemapPage } from '@/lib/products';
import { getSiteUrl } from '@/lib/urls';
import { getCachedSitemap, setCachedSitemap } from '@/lib/sitemap-cache';
import { SITEMAP_PAGE_SIZE, renderSitemapXml } from '@/lib/sitemaps';

export const runtime = 'nodejs';

function parseSitemapParam(raw: string): number | null {
  const match = /^sitemap-(\d+)\.xml$/i.exec(raw);
  if (!match) {
    return null;
  }
  const value = Number.parseInt(match[1], 10);
  if (!Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

export async function GET(
  _request: Request,
  context: { params: { sitemap: string } }
): Promise<Response> {
  const pageNumber = parseSitemapParam(context.params.sitemap);
  if (!pageNumber) {
    return new Response('Not Found', { status: 404 });
  }

  const path = `/sitemaps/${context.params.sitemap}`;
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
    const records = await getPublishedProductsForSitemapPage(pageNumber, SITEMAP_PAGE_SIZE, {
      requestId
    });

    if (records.length === 0) {
      const duration = Date.now() - startedAt;
      console.warn(
        `[sitemap-page][${requestId}] page=${pageNumber} empty (${duration}ms)`
      );
      return new Response('Not Found', { status: 404 });
    }

    const xml = renderSitemapXml(siteUrl, records, { requestId });
    setCachedSitemap(siteUrl, path, xml);
    const duration = Date.now() - startedAt;
    console.log(
      `[sitemap-page][${requestId}] page=${pageNumber} urls=${records.length} generated (${duration}ms)`
    );

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    const duration = Date.now() - startedAt;
    console.error(
      `[sitemap-page][${requestId}] page=${pageNumber} error (${duration}ms)`,
      error
    );
    return NextResponse.json({ error: 'sitemap_error' }, { status: 500 });
  }
}
