export function getSiteUrl(headersHost?: string): string {
  const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }
  if (headersHost) {
    const protocol = process.env.NODE_ENV === 'production' ? 'https' : 'http';
    return `${protocol}://${headersHost}`;
  }
  return 'http://localhost:3000';
}

export function buildProductUrl(slug: string, headersHost?: string): string {
  return `${getSiteUrl(headersHost)}/p/${slug}`;
}

export function buildBlogPostUrl(slug: string, headersHost?: string): string {
  return `${getSiteUrl(headersHost)}/b/${slug}`;
}

export function buildProductCategoryUrl(slug: string, headersHost?: string): string {
  return `${getSiteUrl(headersHost)}/c/${slug}`;
}

export function buildProductCategoryArchiveUrl(headersHost?: string): string {
  return `${getSiteUrl(headersHost)}/p-cat`;
}

export function buildProductCategoryArchivePageUrl(
  page: number,
  headersHost?: string
): string {
  if (page <= 1) {
    return buildProductCategoryArchiveUrl(headersHost);
  }
  return `${buildProductCategoryArchiveUrl(headersHost)}/page/${page}`;
}

export function buildProductCategoryArchiveDetailUrl(
  slug: string,
  headersHost?: string
): string {
  return `${buildProductCategoryArchiveUrl(headersHost)}/${slug}`;
}

export function buildProductCategoryArchiveDetailPageUrl(
  slug: string,
  page: number,
  headersHost?: string
): string {
  if (page <= 1) {
    return buildProductCategoryArchiveDetailUrl(slug, headersHost);
  }
  return `${buildProductCategoryArchiveDetailUrl(slug, headersHost)}/page/${page}`;
}

export function buildBlogCategoryUrl(slug: string, headersHost?: string): string {
  return `${getSiteUrl(headersHost)}/bc/${slug}`;
}

export function buildCategoriesHubUrl(headersHost?: string): string {
  return `${getSiteUrl(headersHost)}/categories`;
}
