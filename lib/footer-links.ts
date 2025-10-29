import footerLinksData from '@/content/footer/links.json';

export interface FooterLink {
  title: string;
  href: string;
  external?: boolean;
}

interface FooterLinkEntry {
  link: FooterLink;
  slug: string | null;
}

const footerLinkEntries: FooterLinkEntry[] = (footerLinksData as FooterLink[]).map((link) => ({
  link,
  slug: extractInternalSlug(link)
}));

export function getFooterLinks(): FooterLink[] {
  return footerLinkEntries.map((entry) => entry.link);
}

export function isExternalLink(link: FooterLink): boolean {
  return link.external === true || /^https?:\/\//i.test(link.href);
}

export function getInternalFooterSlugs(): string[] {
  return footerLinkEntries
    .map((entry) => entry.slug)
    .filter((slug): slug is string => Boolean(slug));
}

export function findFooterLinkBySlug(slug: string): FooterLink | undefined {
  const normalized = normalizeSlugLikeValue(slug);
  if (!normalized) {
    return undefined;
  }

  return footerLinkEntries.find((entry) => entry.slug === normalized)?.link;
}

function stripQueryAndHash(href: string): string {
  return href.split('#')[0]?.split('?')[0] ?? href;
}

function normalizeSlugLikeValue(value: string): string | null {
  const trimmed = value.trim().replace(/\/+$/, '').replace(/^\/+/, '');
  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split('/');
  const slug = segments[segments.length - 1];
  return slug.toLowerCase();
}

function extractInternalSlug(link: FooterLink): string | null {
  if (isExternalLink(link)) {
    return null;
  }

  const cleanedHref = stripQueryAndHash(link.href);
  if (!cleanedHref.startsWith('/')) {
    return null;
  }

  return normalizeSlugLikeValue(cleanedHref) ?? null;
}
