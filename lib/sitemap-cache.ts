const SITEMAP_CACHE_TTL_MS = 5 * 60 * 1000;

interface SitemapCacheEntry {
  xml: string;
  expiresAt: number;
}

const sitemapCache = new Map<string, SitemapCacheEntry>();

function cacheLabel(requestId?: string): string {
  return requestId ? ` [${requestId}]` : '';
}

function makeCacheKey(siteUrl: string, path: string): string {
  return `${siteUrl}::${path}`;
}

export function getCachedSitemap(siteUrl: string, path: string, requestId?: string): string | null {
  const key = makeCacheKey(siteUrl, path);
  const entry = sitemapCache.get(key);
  if (!entry) {
    console.log(
      `[isr-cache][sitemap] site=${siteUrl} path=${path} MISS${cacheLabel(requestId)}`
    );
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    sitemapCache.delete(key);
    console.log(
      `[isr-cache][sitemap] site=${siteUrl} path=${path} EXPIRED${cacheLabel(requestId)}`
    );
    return null;
  }
  console.log(`[isr-cache][sitemap] site=${siteUrl} path=${path} HIT${cacheLabel(requestId)}`);
  return entry.xml;
}

export function setCachedSitemap(siteUrl: string, path: string, xml: string): void {
  const key = makeCacheKey(siteUrl, path);
  sitemapCache.set(key, { xml, expiresAt: Date.now() + SITEMAP_CACHE_TTL_MS });
}

export function clearSitemapCache(): void {
  sitemapCache.clear();
}
