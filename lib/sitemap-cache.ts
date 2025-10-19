const SITEMAP_CACHE_TTL_MS = 5 * 60 * 1000;

interface SitemapCacheEntry {
  xml: string;
  expiresAt: number;
}

const sitemapCache = new Map<string, SitemapCacheEntry>();

function cacheLabel(requestId?: string): string {
  return requestId ? ` [${requestId}]` : '';
}

export function getCachedSitemap(siteUrl: string, requestId?: string): string | null {
  const key = siteUrl;
  const entry = sitemapCache.get(key);
  if (!entry) {
    console.log(`[isr-cache][sitemap] site=${siteUrl} MISS${cacheLabel(requestId)}`);
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    sitemapCache.delete(key);
    console.log(`[isr-cache][sitemap] site=${siteUrl} EXPIRED${cacheLabel(requestId)}`);
    return null;
  }
  console.log(`[isr-cache][sitemap] site=${siteUrl} HIT${cacheLabel(requestId)}`);
  return entry.xml;
}

export function setCachedSitemap(siteUrl: string, xml: string): void {
  sitemapCache.set(siteUrl, { xml, expiresAt: Date.now() + SITEMAP_CACHE_TTL_MS });
}

export function clearSitemapCache(siteUrl?: string): void {
  if (siteUrl) {
    sitemapCache.delete(siteUrl);
  } else {
    sitemapCache.clear();
  }
}
