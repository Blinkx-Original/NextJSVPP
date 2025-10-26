import he from 'he';
import type { NormalizedProduct } from './products';

const WHITESPACE_RE = /\s+/g;

function collapseWhitespace(value: string): string {
  return value.replace(WHITESPACE_RE, ' ').trim();
}

function truncateText(text: string, maxLength = 160): string {
  if (text.length <= maxLength) {
    return text;
  }
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > Math.floor(maxLength * 0.4)) {
    return `${truncated.slice(0, lastSpace).trimEnd()}…`;
  }
  return `${truncated.trimEnd()}…`;
}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--.*?-->/gs, ' ')
    .replace(/<[^>]+>/g, ' ');
}

export function excerptFromHtml(html: string | null | undefined, maxLength = 160): string {
  if (!html) {
    return '';
  }
  const stripped = stripHtml(html);
  const decoded = he.decode(stripped);
  const collapsed = collapseWhitespace(decoded);
  if (!collapsed) {
    return '';
  }
  return truncateText(collapsed, maxLength);
}

export interface BuildSeoResult {
  description: string;
  jsonLd: string;
}

function resolveDescription(product: NormalizedProduct): string {
  const primary = collapseWhitespace(product.meta_description || '');
  if (primary) {
    return truncateText(primary);
  }
  const summary = collapseWhitespace(product.short_summary || '');
  if (summary) {
    return truncateText(summary);
  }
  return excerptFromHtml(product.desc_html, 160);
}

function pickOfferUrl(product: NormalizedProduct, canonicalUrl: string): string {
  const candidates = [
    product.cta_affiliate_url,
    product.cta_stripe_url,
    product.cta_lead_url,
    product.cta_paypal_url,
    canonicalUrl
  ];
  return candidates.find((item) => collapseWhitespace(item || '').length > 0) ?? canonicalUrl;
}

function buildFallbackSchema(product: NormalizedProduct, canonicalUrl: string, description: string) {
  const images = Array.isArray(product.images) ? product.images.filter(Boolean).slice(0, 3) : [];
  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title_h1 || product.slug,
    description,
    url: canonicalUrl,
    offers: {
      '@type': 'Offer',
      url: pickOfferUrl(product, canonicalUrl),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock'
    }
  };

  if (product.brand) {
    payload.brand = { '@type': 'Brand', name: product.brand };
  }
  if (product.model) {
    payload.model = product.model;
  }
  if (product.sku) {
    payload.sku = product.sku;
  }
  if (images.length > 0) {
    payload.image = images;
  }
  if (!description) {
    delete payload.description;
  }

  return payload;
}

export function buildSeo(product: NormalizedProduct, canonicalUrl: string): BuildSeoResult {
  const description = resolveDescription(product);
  const stored = collapseWhitespace(product.schema_json || '');
  const jsonLd = stored
    ? product.schema_json
    : JSON.stringify(buildFallbackSchema(product, canonicalUrl, description), null, 2);

  return {
    description,
    jsonLd
  };
}

export function buildMetaTitle(product: NormalizedProduct): string {
  const title = collapseWhitespace(product.title_h1 || product.slug);
  const brand = collapseWhitespace(product.brand || '');
  if (brand) {
    return collapseWhitespace(`${title} | ${brand}`);
  }
  return title;
}
