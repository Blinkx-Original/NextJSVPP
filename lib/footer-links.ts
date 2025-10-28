import footerLinksData from '@/content/footer/links.json';

export interface FooterLink {
  title: string;
  href: string;
  external?: boolean;
}

const footerLinks: FooterLink[] = footerLinksData as FooterLink[];

export function getFooterLinks(): FooterLink[] {
  return [...footerLinks];
}

export function isExternalLink(link: FooterLink): boolean {
  return link.external === true || /^https?:\/\//i.test(link.href);
}

export function getInternalFooterSlugs(): string[] {
  return footerLinks
    .filter((link) => !isExternalLink(link) && link.href.startsWith('/legal/'))
    .map((link) => link.href.replace(/^\/legal\//, '').replace(/\/$/, ''));
}

export function findFooterLinkBySlug(slug: string): FooterLink | undefined {
  const normalized = slug.replace(/\/$/, '').toLowerCase();
  return footerLinks.find((link) => {
    if (isExternalLink(link)) {
      return false;
    }
    const hrefSlug = link.href.replace(/^\/legal\//, '').replace(/\/$/, '').toLowerCase();
    return hrefSlug === normalized;
  });
}
