import type { SitemapBlogPostRecord } from './blog-posts';
import type { SitemapProductRecord } from './products';

export const SITEMAP_PAGE_SIZE = 45000;

function makeProductUrl(siteUrl: string, slug: string): string | null {
  const trimmed = typeof slug === 'string' ? slug.trim() : '';
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(`/p/${trimmed}`, siteUrl);
    return url.toString();
  } catch {
    return null;
  }
}

function makeBlogUrl(siteUrl: string, slug: string): string | null {
  const trimmed = typeof slug === 'string' ? slug.trim() : '';
  if (!trimmed) {
    return null;
  }
  try {
    const url = new URL(`/b/${trimmed}`, siteUrl);
    return url.toString();
  } catch {
    return null;
  }
}

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

export function resolveLastModified(record: SitemapProductRecord): string {
  const candidates = [record.last_tidb_update_at, record.updated_at];
  for (const candidate of candidates) {
    const iso = toIsoDate(typeof candidate === 'string' ? candidate : null);
    if (iso) {
      return iso;
    }
  }
  return new Date().toISOString();
}

interface RenderSitemapXmlOptions {
  requestId?: string;
}

export function renderSitemapXml(
  siteUrl: string,
  records: SitemapProductRecord[],
  options?: RenderSitemapXmlOptions
): string {
  const requestIdLabel = options?.requestId ? ` [${options.requestId}]` : '';
  const urls = records
    .map((record) => {
      const loc = makeProductUrl(siteUrl, record.slug);
      if (!loc) {
        const idLabel = record.id ? ` id=${record.id.toString()}` : '';
        console.warn(`[sitemap][skip]${idLabel} reason=invalid-slug${requestIdLabel}`);
        return null;
      }
      const lastmod = resolveLastModified(record);
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    })
    .filter((value): value is string => value !== null)
    .join('\n');
  const content = urls ? `\n${urls}\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${content}</urlset>`;
}

export function renderBlogSitemapXml(
  siteUrl: string,
  records: SitemapBlogPostRecord[],
  options?: RenderSitemapXmlOptions
): string {
  const requestIdLabel = options?.requestId ? ` [${options.requestId}]` : '';
  const urls = records
    .map((record) => {
      const loc = makeBlogUrl(siteUrl, record.slug);
      if (!loc) {
        const idLabel = record.id ? ` id=${record.id.toString()}` : '';
        console.warn(`[sitemap][blog][skip]${idLabel} reason=invalid-slug${requestIdLabel}`);
        return null;
      }
      const lastmod = resolveBlogLastModified(record);
      return `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    })
    .filter((value): value is string => value !== null)
    .join('\n');
  const content = urls ? `\n${urls}\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${content}</urlset>`;
}

export interface SitemapIndexEntry {
  loc: string;
  lastmod: string;
}

export function renderSitemapIndexXml(entries: SitemapIndexEntry[]): string {
  const sitemapEntries = entries
    .map((entry) => `  <sitemap>\n    <loc>${entry.loc}</loc>\n    <lastmod>${entry.lastmod}</lastmod>\n  </sitemap>`)
    .join('\n');
  const content = sitemapEntries ? `\n${sitemapEntries}\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${content}</sitemapindex>`;
}

export function computeChunkLastModified(records: SitemapProductRecord[]): string {
  let latest: string | null = null;
  for (const record of records) {
    const iso = resolveLastModified(record);
    if (!latest || iso > latest) {
      latest = iso;
    }
  }
  return latest ?? new Date().toISOString();
}

export function resolveBlogLastModified(record: SitemapBlogPostRecord): string {
  const candidates = [record.last_tidb_update_at, record.published_at];
  for (const candidate of candidates) {
    const iso = toIsoDate(typeof candidate === 'string' ? candidate : null);
    if (iso) {
      return iso;
    }
  }
  return new Date().toISOString();
}

export function computeBlogChunkLastModified(records: SitemapBlogPostRecord[]): string {
  let latest: string | null = null;
  for (const record of records) {
    const iso = resolveBlogLastModified(record);
    if (!latest || iso > latest) {
      latest = iso;
    }
  }
  return latest ?? new Date().toISOString();
}

export interface SitemapUrlEntry {
  loc: string;
  lastmod?: string | null;
}

export function renderUrlsetXml(entries: SitemapUrlEntry[]): string {
  const urls = entries
    .filter((entry) => typeof entry.loc === 'string' && entry.loc.length > 0)
    .map((entry) => {
      const parts = [`  <url>`, `    <loc>${entry.loc}</loc>`];
      if (entry.lastmod) {
        parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      }
      parts.push('  </url>');
      return parts.join('\n');
    })
    .join('\n');
  const content = urls ? `\n${urls}\n` : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${content}</urlset>`;
}
