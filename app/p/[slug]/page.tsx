import type { Metadata } from 'next';
import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from './page.module.css';
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

const CTA_CONFIG = [
  { key: 'cta_lead_url', label: 'Request a quote' },
  { key: 'cta_affiliate_url', label: 'Buy via Affiliate' },
  { key: 'cta_stripe_url', label: 'Pay with Stripe' },
  { key: 'cta_paypal_url', label: 'Pay with PayPal' }
] as const;

type CtaKey = (typeof CTA_CONFIG)[number]['key'];

function truncateSummary(summary: string, maxLength = 160): string {
  return truncateDescription(summary, maxLength);
}

export default async function ProductPage({ params }: PageProps) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const productResult = await loadProduct(params.slug, { requestId });
  const duration = Date.now() - startedAt;

  if (!productResult) {
    console.log(`[page/p][${requestId}] slug=${params.slug} missing (${duration}ms)`);
    notFound();
  }

  console.log(`[page/p][${requestId}] slug=${params.slug} loaded (${duration}ms)`);

  const { normalized } = productResult;
  const host = headers().get('host') ?? undefined;
  const canonical = buildProductUrl(normalized.slug, host);
  const jsonLd = buildProductJsonLd(normalized, canonical);
  const primaryImage = normalized.images[0];
  const summary = normalized.short_summary ? truncateSummary(normalized.short_summary) : '';
  const resolveCtaUrl = (key: CtaKey): string => normalized[key];
  const ctas = CTA_CONFIG.filter((item) => resolveCtaUrl(item.key).length > 0);
  const primaryCtaKey = ctas[0]?.key;

  return (
    <main className={styles.productPage}>
      <section className={styles.productHero}>
        <div className={styles.productMedia}>
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={normalized.title_h1 || normalized.slug}
              fill
              sizes="(max-width: 900px) 100vw, 540px"
              priority
            />
          ) : (
            <div className={styles.productMediaPlaceholder} aria-hidden="true">
              <span>Image coming soon</span>
            </div>
          )}
        </div>
        <div className={styles.productDetails}>
          <h1 className={styles.productTitle}>{normalized.title_h1 || normalized.slug}</h1>
          {summary ? <p className={styles.productSummary}>{summary}</p> : null}
          {ctas.length > 0 ? (
            <div className={styles.productCtas}>
              {ctas.map((cta) => {
                const url = resolveCtaUrl(cta.key);
                const isPrimary = cta.key === primaryCtaKey;
                const ctaClassName = [
                  styles.productCta,
                  isPrimary ? styles.productCtaPrimary : styles.productCtaSecondary
                ].join(' ');
                return (
                  <a
                    key={cta.key}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={ctaClassName}
                  >
                    {cta.label}
                  </a>
                );
              })}
            </div>
          ) : null}
          <div
            className={
              [
                styles.productPrice,
                normalized.price ? styles.productPriceVisible : styles.productPriceEmpty
              ].join(' ')
            }
            aria-hidden={normalized.price ? undefined : true}
          >
            {normalized.price ? <span>{normalized.price}</span> : null}
          </div>
        </div>
      </section>
      {normalized.desc_html ? (
        <section className={styles.productDescription}>
          <article
            className={styles.productDescriptionContent}
            dangerouslySetInnerHTML={{ __html: normalized.desc_html }}
          />
        </section>
      ) : null}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </main>
  );
}
