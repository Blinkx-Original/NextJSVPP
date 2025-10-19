import type { SitemapProductRecord } from './products';

export const SITEMAP_PAGE_SIZE = 1000;

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

export function renderSitemapXml(siteUrl: string, records: SitemapProductRecord[]): string {
  const urls = records
    .map((record) => {
      const lastmod = resolveLastModified(record);
      return `  <url>\n    <loc>${siteUrl}/p/${record.slug}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
    })
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
