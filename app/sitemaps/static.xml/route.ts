import { headers } from 'next/headers';
import { createRequestId } from '@/lib/request-id';
import { getSiteUrl } from '@/lib/urls';
import { getCachedSitemap, setCachedSitemap } from '@/lib/sitemap-cache';
import { renderUrlsetXml } from '@/lib/sitemaps';

export const runtime = 'nodejs';

export async function GET(): Promise<Response> {
  const path = '/sitemaps/static.xml';
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

  const now = new Date().toISOString();
  const xml = renderUrlsetXml([
    {
      loc: `${siteUrl}/categories`,
      lastmod: now
    }
  ]);

  setCachedSitemap(siteUrl, path, xml);

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}
