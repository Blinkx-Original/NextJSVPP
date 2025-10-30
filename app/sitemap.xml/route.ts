import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRequestId } from '@/lib/request-id';
import { collectPublishedProductsForSitemap } from '@/lib/products';
import { collectPublishedBlogPostsForSitemap } from '@/lib/blog-posts';
import { getSiteUrl } from '@/lib/urls';
import { getCachedSitemap, setCachedSitemap } from '@/lib/sitemap-cache';
import {
  SITEMAP_PAGE_SIZE,
  computeChunkLastModified,
  computeBlogChunkLastModified,
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
    const [productCollection, blogCollection] = await Promise.all([
      collectPublishedProductsForSitemap({
        requestId,
        pageSize: SITEMAP_PAGE_SIZE
      }),
      collectPublishedBlogPostsForSitemap({
        requestId,
        pageSize: SITEMAP_PAGE_SIZE
      })
    ]);

    const staticLastMod = new Date().toISOString();
    const staticEntries: SitemapIndexEntry[] = [
      { loc: `${siteUrl}/sitemaps/static.xml`, lastmod: staticLastMod },
      { loc: `${siteUrl}/sitemaps/categories.xml`, lastmod: staticLastMod },
      { loc: `${siteUrl}/sitemaps/blog-categories.xml`, lastmod: staticLastMod }
    ];

    const productEntries: SitemapIndexEntry[] = productCollection.batches.map((records, index) => ({
      loc: `${siteUrl}/sitemaps/sitemap-${index + 1}.xml`,
      lastmod: computeChunkLastModified(records)
    }));

    const blogEntries: SitemapIndexEntry[] = blogCollection.batches.map((records, index) => ({
      loc: `${siteUrl}/sitemaps/blog-${index + 1}.xml`,
      lastmod: computeBlogChunkLastModified(records)
    }));

    const entries: SitemapIndexEntry[] = [...staticEntries, ...productEntries, ...blogEntries];

    const xml = renderSitemapIndexXml(entries);
    setCachedSitemap(siteUrl, path, xml);
    const duration = Date.now() - startedAt;
    console.log(
      `[sitemap-index][${requestId}] entries=${entries.length} total=${
        productCollection.totalCount + blogCollection.totalCount
      } generated (${duration}ms)`
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
