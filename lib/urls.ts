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
