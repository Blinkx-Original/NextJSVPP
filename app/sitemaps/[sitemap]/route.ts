import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { createRequestId } from '@/lib/request-id';
import { getPublishedProductsForSitemapPage } from '@/lib/products';
import { getPublishedBlogPostsForSitemapPage } from '@/lib/blog-posts';
import { getSiteUrl } from '@/lib/urls';
import { getCachedSitemap, setCachedSitemap } from '@/lib/sitemap-cache';
import { SITEMAP_PAGE_SIZE, renderSitemapXml, renderBlogSitemapXml } from '@/lib/sitemaps';

export const runtime = 'nodejs';

type SitemapRequest =
  | { type: 'product'; page: number }
  | { type: 'blog'; page: number };

function parseSitemapParam(raw: string): SitemapRequest | null {
  const productMatch = /^sitemap-(\d+)\.xml$/i.exec(raw);
  if (productMatch) {
    const value = Number.parseInt(productMatch[1], 10);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return { type: 'product', page: value };
  }

  const blogMatch = /^blog-(\d+)\.xml$/i.exec(raw);
  if (blogMatch) {
    const value = Number.parseInt(blogMatch[1], 10);
    if (!Number.isFinite(value) || value <= 0) {
      return null;
    }
    return { type: 'blog', page: value };
  }

  return null;
}

export async function GET(
  _request: Request,
  context: { params: { sitemap: string } }
): Promise<Response> {
  const parsed = parseSitemapParam(context.params.sitemap);
  if (!parsed) {
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
    if (parsed.type === 'product') {
      const records = await getPublishedProductsForSitemapPage(parsed.page, SITEMAP_PAGE_SIZE, {
        requestId
      });

      if (records.length === 0) {
        const duration = Date.now() - startedAt;
        console.warn(
          `[sitemap-page][${requestId}] type=${parsed.type} page=${parsed.page} empty (${duration}ms)`
        );
        return new Response('Not Found', { status: 404 });
      }

      const xml = renderSitemapXml(siteUrl, records, { requestId });
      setCachedSitemap(siteUrl, path, xml);
      const duration = Date.now() - startedAt;
      console.log(
        `[sitemap-page][${requestId}] type=${parsed.type} page=${parsed.page} urls=${records.length} generated (${duration}ms)`
      );

      return new Response(xml, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'Cache-Control': 'public, max-age=300'
        }
      });
    }

    const blogRecords = await getPublishedBlogPostsForSitemapPage(parsed.page, SITEMAP_PAGE_SIZE, {
      requestId
    });

    if (blogRecords.length === 0) {
      const duration = Date.now() - startedAt;
      console.warn(
        `[sitemap-page][${requestId}] type=${parsed.type} page=${parsed.page} empty (${duration}ms)`
      );
      return new Response('Not Found', { status: 404 });
    }

    const xml = renderBlogSitemapXml(siteUrl, blogRecords, { requestId });
    setCachedSitemap(siteUrl, path, xml);
    const duration = Date.now() - startedAt;
    console.log(
      `[sitemap-page][${requestId}] type=${parsed.type} page=${parsed.page} urls=${blogRecords.length} generated (${duration}ms)`
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
      `[sitemap-page][${requestId}] type=${parsed.type} page=${parsed.page} error (${duration}ms)`,
      error
    );
    return NextResponse.json({ error: 'sitemap_error' }, { status: 500 });
  }
}
