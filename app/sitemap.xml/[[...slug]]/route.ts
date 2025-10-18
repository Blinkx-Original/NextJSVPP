import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import { getPublishedSlugs } from '@/lib/products';
import { getSiteUrl } from '@/lib/urls';

const LIMIT = 50000;

async function getSitemapBatches() {
  const batches: string[][] = [];
  let offset = 0;
  while (true) {
    const slugs = await getPublishedSlugs(LIMIT, offset);
    if (slugs.length === 0) {
      break;
    }
    batches.push(slugs);
    if (slugs.length < LIMIT) {
      break;
    }
    offset += LIMIT;
  }
  return batches;
}

function buildXml(body: string) {
  return new Response(body, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300'
    }
  });
}

function renderSitemap(urls: string[]) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls
    .map((url) => `\n  <url><loc>${url}</loc></url>`)
    .join('')}\n</urlset>`;
  return buildXml(xml);
}

function renderIndex(entries: string[]) {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries
    .map((loc) => `\n  <sitemap><loc>${loc}</loc></sitemap>`)
    .join('')}\n</sitemapindex>`;
  return buildXml(xml);
}

export async function GET(_: Request, { params }: { params: { slug?: string[] } }) {
  const host = headers().get('host') ?? undefined;
  const siteUrl = getSiteUrl(host);
  const batches = await getSitemapBatches();
  const slug = params.slug ?? [];

  if (slug.length === 0) {
    if (batches.length <= 1) {
      const urls = (batches[0] ?? []).map((productSlug) => `${siteUrl}/p/${productSlug}`);
      return renderSitemap(urls);
    }
    const entries = batches.map((_, index) => `${siteUrl}/sitemap.xml/${index + 1}`);
    return renderIndex(entries);
  }

  const index = Number(slug[0]);
  if (!Number.isFinite(index) || index < 1 || index > batches.length) {
    return NextResponse.json({ error: 'Not Found' }, { status: 404 });
  }
  const urls = batches[index - 1].map((productSlug) => `${siteUrl}/p/${productSlug}`);
  return renderSitemap(urls);
}
