import type { Metadata } from 'next';
import Image from 'next/image';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from '../../p/[slug]/page.module.css';
import { CTA_DEFAULT_LABELS, resolveCtaLabel } from '@/lib/product-cta';
import {
  getNormalizedPublishedBlogPost,
  type NormalizedBlogPost,
  type NormalizedBlogPostResult
} from '@/lib/blog-posts';
import { createRequestId } from '@/lib/request-id';
import { buildBlogPostUrl } from '@/lib/urls';
import { buildBlogSeo, buildBlogMetaTitle } from '@/lib/blog-seo';

export const runtime = 'nodejs';
export const revalidate = 300;

interface PageProps {
  params: { slug: string };
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

async function loadBlogPost(
  slug: string,
  options?: { requestId?: string; skipCache?: boolean }
): Promise<NormalizedBlogPostResult | null> {
  return getNormalizedPublishedBlogPost(slug, options);
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const requestId = createRequestId();
  const postResult = await loadBlogPost(params.slug, { requestId });
  if (!postResult) {
    return {};
  }

  const host = headers().get('host') ?? undefined;
  const canonicalUrl = buildBlogPostUrl(postResult.normalized.slug, host);
  const seo = buildBlogSeo(postResult.normalized, canonicalUrl);
  const metaTitle = buildBlogMetaTitle(postResult.normalized);
  const metaDescription = seo.description;
  const primaryImage = postResult.normalized.cover_image_url || null;
  const publishedAt = postResult.normalized.published_at ?? undefined;

  return {
    title: metaTitle,
    description: metaDescription || undefined,
    alternates: { canonical: seo.canonical },
    openGraph: {
      type: 'article',
      title: metaTitle,
      description: metaDescription || undefined,
      url: seo.canonical,
      images: primaryImage ? [{ url: primaryImage }] : undefined,
      publishedTime: publishedAt
    },
    twitter: {
      card: primaryImage ? 'summary_large_image' : 'summary',
      title: metaTitle,
      description: metaDescription || undefined,
      images: primaryImage ? [primaryImage] : undefined
    },
    robots: { index: true, follow: true },
    other: {
      'og:type': 'article'
    }
  };
}

const CTA_CONFIG = [
  { type: 'lead', urlKey: 'cta_lead_url', labelKey: 'cta_lead_label' },
  { type: 'affiliate', urlKey: 'cta_affiliate_url', labelKey: 'cta_affiliate_label' }
] as const;

function truncateSummary(summary: string, maxLength = 160): string {
  return truncateDescription(summary, maxLength);
}

export default async function BlogPostPage({ params }: PageProps) {
  const requestId = createRequestId();
  const startedAt = Date.now();
  const postResult = await loadBlogPost(params.slug, { requestId });
  const duration = Date.now() - startedAt;

  if (!postResult) {
    console.log(`[page/b][${requestId}] slug=${params.slug} missing (${duration}ms)`);
    notFound();
  }

  console.log(`[page/b][${requestId}] slug=${params.slug} loaded (${duration}ms)`);

  const normalized = postResult.normalized;
  const host = headers().get('host') ?? undefined;
  const canonicalUrl = buildBlogPostUrl(normalized.slug, host);
  const seo = buildBlogSeo(normalized, canonicalUrl);
  const primaryImage = normalized.cover_image_url || null;
  const summary = normalized.short_summary ? truncateSummary(normalized.short_summary) : '';
  const ctas = CTA_CONFIG.map((item) => {
    const url = normalized[item.urlKey as keyof NormalizedBlogPost] as string;
    const labelValue = normalized[item.labelKey as keyof NormalizedBlogPost] as string;
    return {
      type: item.type,
      url,
      label: resolveCtaLabel(item.type as keyof typeof CTA_DEFAULT_LABELS, labelValue)
    };
  }).filter((cta) => cta.url.length > 0);
  const primaryCtaType = ctas[0]?.type;

  return (
    <main className={styles.productPage}>
      <section className={styles.productHero}>
        <div className={styles.productMedia}>
          {primaryImage ? (
            <Image
              src={primaryImage}
              alt={normalized.title_h1 || normalized.slug}
              width={1200}
              height={675}
              sizes="(max-width: 900px) 100vw, 720px"
              priority
              className={styles.productMediaImage}
            />
          ) : (
            <div className={styles.productMediaPlaceholder} aria-hidden="true" />
          )}
        </div>
        <div className={styles.productDetails}>
          <h1 className={`${styles.productTitle} bx-break`}>
            {normalized.title_h1 || normalized.slug}
          </h1>
          {summary ? <p className={styles.productSummary}>{summary}</p> : null}
          {ctas.length > 0 ? (
            <div className={styles.productCtas}>
              {ctas.map((cta) => {
                const isPrimary = cta.type === primaryCtaType;
                const ctaClassName = [
                  styles.productCta,
                  isPrimary ? styles.productCtaPrimary : styles.productCtaSecondary
                ].join(' ');
                return (
                  <a
                    key={cta.type}
                    href={cta.url}
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
        </div>
      </section>
      {normalized.content_html ? (
        <section className={styles.productDescription}>
          <article
            className={styles.productDescriptionContent}
            dangerouslySetInnerHTML={{ __html: normalized.content_html }}
          />
        </section>
      ) : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: seo.jsonLd }}
        suppressHydrationWarning
      />
    </main>
  );
}
