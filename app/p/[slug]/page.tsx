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
      <style jsx>{`
        .product-page {
          max-width: 1200px;
          margin: 0 auto;
          padding: 3rem 1.5rem 4rem;
          display: flex;
          flex-direction: column;
          gap: 3rem;
        }

        .product-hero {
          display: flex;
          flex-direction: column;
          gap: 2rem;
        }

        .product-media {
          position: relative;
          width: 100%;
          border-radius: 20px;
          overflow: hidden;
          background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
          aspect-ratio: 4 / 3;
        }

        .product-media :global(img) {
          object-fit: contain;
          background: #0f172a;
        }

        .product-media__placeholder {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: rgba(255, 255, 255, 0.7);
          font-size: 1rem;
          letter-spacing: 0.05em;
          text-transform: uppercase;
        }

        .product-details {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .product-title {
          margin: 0;
          font-size: clamp(2rem, 2.5vw + 1.5rem, 3rem);
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: #0f172a;
        }

        .product-summary {
          margin: 0;
          font-size: 1.05rem;
          line-height: 1.7;
          color: #1f2937;
          max-width: 42ch;
        }

        .product-ctas {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }

        .product-cta {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.85rem 1.5rem;
          border-radius: 999px;
          font-weight: 600;
          text-decoration: none;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }

        .product-cta--primary {
          background: #2563eb;
          color: #ffffff;
          box-shadow: 0 15px 35px rgba(37, 99, 235, 0.25);
        }

        .product-cta--secondary {
          background: rgba(37, 99, 235, 0.12);
          color: #1d4ed8;
          border: 1px solid rgba(37, 99, 235, 0.2);
        }

        .product-cta:focus-visible {
          outline: 2px solid #1d4ed8;
          outline-offset: 3px;
        }

        .product-cta:hover {
          transform: translateY(-2px);
        }

        .product-price {
          min-height: 2.5rem;
          display: flex;
          align-items: center;
          font-size: 1.35rem;
          font-weight: 600;
          color: #0f172a;
        }

        .product-price--empty {
          opacity: 0.35;
        }

        .product-description {
          background: #f8fafc;
          border-radius: 24px;
          padding: 2.5rem;
          box-shadow: inset 0 1px 0 rgba(15, 23, 42, 0.04);
        }

        .product-description__content :global(p) {
          color: #0f172a;
          line-height: 1.8;
          margin: 1rem 0;
        }

        .product-description__content :global(h2),
        .product-description__content :global(h3),
        .product-description__content :global(h4) {
          color: #0f172a;
          margin-top: 2rem;
        }

        .product-description__content :global(a) {
          color: #2563eb;
          text-decoration: none;
        }

        .product-description__content :global(a:hover) {
          text-decoration: underline;
        }

        @media (min-width: 900px) {
          .product-hero {
            flex-direction: row;
          }

          .product-media {
            flex: 0 0 48%;
          }

          .product-details {
            padding-top: 0.5rem;
          }
        }

        @media (max-width: 600px) {
          .product-page {
            padding: 2.5rem 1.25rem 3.5rem;
          }

          .product-description {
            padding: 1.75rem;
          }
        }
      `}</style>
    </main>
  );
}
