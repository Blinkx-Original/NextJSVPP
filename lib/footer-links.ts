import footerLinksData from '@/content/footer/links.json';

export interface FooterLink {
  title: string;
  href: string;
  external?: boolean;
}

const footerLinks: FooterLink[] = footerLinksData as FooterLink[];

function stripQueryAndHash(href: string): string {
  return href.split('#')[0]?.split('?')[0] ?? href;
}

function extractInternalSlug(link: FooterLink): string | null {
  if (isExternalLink(link)) {
    return null;
  }

  const cleanedHref = stripQueryAndHash(link.href).trim();
  if (!cleanedHref.startsWith('/')) {
    return null;
  }

  const trimmed = cleanedHref.replace(/\/+$/, '').replace(/^\/+/, '');
  if (!trimmed) {
    return null;
  }

  const segments = trimmed.split('/');
  const slug = segments[segments.length - 1];
  return slug.toLowerCase();
}

export function getFooterLinks(): FooterLink[] {
  return [...footerLinks];
}

export function isExternalLink(link: FooterLink): boolean {
  return link.external === true || /^https?:\/\//i.test(link.href);
}

export function getInternalFooterSlugs(): string[] {
  return footerLinks
    .map((link) => extractInternalSlug(link))
    .filter((slug): slug is string => Boolean(slug));
}

export function findFooterLinkBySlug(slug: string): FooterLink | undefined {
  const normalized = slug.replace(/\/$/, '').toLowerCase();
  return footerLinks.find((link) => extractInternalSlug(link) === normalized);
}
