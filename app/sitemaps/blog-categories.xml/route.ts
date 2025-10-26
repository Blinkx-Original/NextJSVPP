import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { getPublishedCategorySitemapEntries } from '@/lib/categories';
import { createRequestId } from '@/lib/request-id';
import { getSiteUrl, buildBlogCategoryUrl } from '@/lib/urls';
import { getCachedSitemap, setCachedSitemap } from '@/lib/sitemap-cache';
import { renderUrlsetXml } from '@/lib/sitemaps';

export const runtime = 'nodejs';

function toIso(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

export async function GET(): Promise<Response> {
  const path = '/sitemaps/blog-categories.xml';
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

  try {
    const entries = await getPublishedCategorySitemapEntries();
    const blogEntries = entries.filter((entry) => entry.type === 'blog');
    const xml = renderUrlsetXml(
      blogEntries.map((entry) => ({
        loc: buildBlogCategoryUrl(entry.slug, host),
        lastmod: toIso(entry.lastUpdatedAt)
      }))
    );

    setCachedSitemap(siteUrl, path, xml);

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300'
      }
    });
  } catch (error) {
    console.error('[sitemap-blog-categories] error', error, { requestId });
    return NextResponse.json({ error: 'blog_categories_sitemap_error' }, { status: 500 });
  }
}
