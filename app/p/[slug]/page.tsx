import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import {
  getNormalizedPublishedProduct,
  type NormalizedProduct,
  type NormalizedProductResult
} from '@/lib/products';
import { createRequestId } from '@/lib/request-id';
import { buildProductUrl } from '@/lib/urls';

export const runtime = 'nodejs';
export const revalidate = 300;

interface PageProps {
  params: { slug: string };
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function buildMetaTitle(product: NormalizedProduct): string {
  const brandModel = collapseWhitespace([product.brand, product.model].filter(Boolean).join(' '));
  const title = collapseWhitespace(product.title_h1 || product.slug);
  if (brandModel) {
    return collapseWhitespace(`${title} | ${brandModel}`);
  }
  return title;
}

function truncateDescription(text: string, maxLength = 160): string {
  if (text.length <= maxLength) {
    return text;
  }
  const truncated = text.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 50) {
    return `${truncated.slice(0, lastSpace).trimEnd()}…`;
  }
  return `${truncated.trimEnd()}…`;
}

function buildMetaDescription(product: NormalizedProduct): string {
  const source = collapseWhitespace(product.meta_description || product.short_summary || '');
  if (!source) {
    return '';
  }
  return truncateDescription(source);
}

function buildProductJsonLd(product: NormalizedProduct, canonicalUrl: string): string {
  const payload: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title_h1 || product.slug,
    url: canonicalUrl
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
  if (product.images.length > 0) {
    payload.image = product.images;
  }
  const description = collapseWhitespace(product.meta_description || product.short_summary || '');
  if (description) {
    payload.description = description;
  }
  return JSON.stringify(payload, null, 2);
}

async function loadProduct(
  slug: string,
  options?: { requestId?: string; skipCache?: boolean }
): Promise<NormalizedProductResult | null> {
  return getNormalizedPublishedProduct(slug, options);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const requestId = createRequestId();
  const productResult = await loadProduct(params.slug, { requestId });
  if (!productResult) {
    return {};
  }
  const host = headers().get('host') ?? undefined;
  const canonical = buildProductUrl(productResult.normalized.slug, host);
  const metaTitle = buildMetaTitle(productResult.normalized);
  const metaDescription = buildMetaDescription(productResult.normalized);
  const primaryImage = productResult.normalized.images[0];

  return {
    title: metaTitle,
    description: metaDescription || undefined,
    alternates: { canonical },
    openGraph: {
      title: metaTitle,
      description: metaDescription || undefined,
      url: canonical,
      images: primaryImage ? [{ url: primaryImage }] : undefined
    },
    twitter: {
      card: primaryImage ? 'summary_large_image' : 'summary',
      title: metaTitle,
      description: metaDescription || undefined,
      images: primaryImage ? [primaryImage] : undefined
    },
    other: {
      'og:type': 'product'
    }
  };
}

export default async function ProductDebugPage({ params }: PageProps) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const productResult = await loadProduct(params.slug, { requestId });
  const duration = Date.now() - startedAt;

  if (!productResult) {
    console.log(`[page/p][${requestId}] slug=${params.slug} missing (${duration}ms)`);
    notFound();
  }

  console.log(`[page/p][${requestId}] slug=${params.slug} loaded (${duration}ms)`);

  const { normalized, raw } = productResult;
  const host = headers().get('host') ?? undefined;
  const canonical = buildProductUrl(normalized.slug, host);
  const jsonLd = buildProductJsonLd(normalized, canonical);

  return (
    <main>
      <h1>{normalized.title_h1 || normalized.slug}</h1>
      {normalized.desc_html ? (
        <article dangerouslySetInnerHTML={{ __html: normalized.desc_html }} />
      ) : null}
      <pre>{JSON.stringify({ normalized, raw }, null, 2)}</pre>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </main>
  );
}
