import footerLinksData from '@/content/footer/links.json';

interface FooterLinkRecord {
  title: string;
  href: string;
  external?: boolean;
}

export interface FooterLink {
  title: string;
  href: string;
  external: boolean;
  slug?: string;
  originalHref: string;
}

function extractSlug(rawHref: string): string | undefined {
  if (!rawHref) {
    return undefined;
  }

  const href = rawHref.trim();
  if (!href || /^https?:\/\//i.test(href)) {
    return undefined;
  }

  const normalizedPath = href.startsWith('/') ? href : `/${href}`;
  const [pathWithoutSearch] = normalizedPath.split(/[?#]/, 1);
  const path = pathWithoutSearch?.replace(/\/+$/g, '') ?? '';
  if (!path) {
    return undefined;
  }

  const segments = path.split('/').filter(Boolean);
  if (segments.length === 0) {
    return undefined;
  }

  const firstSegment = segments[0]?.toLowerCase();
  if (segments.length === 1 || firstSegment === 'legal') {
    return segments[segments.length - 1];
  }

  return undefined;
}

function normalizeFooterLink(record: FooterLinkRecord): FooterLink {
  const rawHref = record.href ?? '';
  const trimmedHref = rawHref.trim();
  const explicitExternal = record.external === true;
  const inferredExternal = /^https?:\/\//i.test(trimmedHref);
  const external = explicitExternal || inferredExternal;

  const slug = external ? undefined : extractSlug(trimmedHref);
  const href = !external && slug ? `/legal/${slug}` : trimmedHref || '#';

  return {
    title: record.title,
    href,
    external,
    slug,
    originalHref: trimmedHref || rawHref
  };
}

const footerLinks: FooterLink[] = (footerLinksData as FooterLinkRecord[]).map(
  normalizeFooterLink
);

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
  return footerLinks.map((link) => ({ ...link }));
}

export function isExternalLink(link: FooterLink): boolean {
  return link.external;
}

export function getInternalFooterSlugs(): string[] {
  return footerLinks
    .filter((link) => !link.external && link.slug)
    .map((link) => link.slug!)
    .filter((value, index, array) => array.indexOf(value) === index);
}

export function findFooterLinkBySlug(slug: string): FooterLink | undefined {
  const normalized = slug.trim().replace(/\/$/, '').toLowerCase();
  return footerLinks.find((link) =>
    link.slug ? link.slug.trim().replace(/\/$/, '').toLowerCase() === normalized : false
  );
}
