import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from '../../p/[slug]/page.module.css';
import blogStyles from './page.module.css';
import relatedStyles from './related-products.module.css';
import ProductListingGrid from './ProductListingGrid';
import { CTA_DEFAULT_LABELS, resolveCtaLabel } from '@/lib/product-cta';
import { slugifyCategoryName } from '@/lib/category-slug';
import {
  getNormalizedPublishedBlogPost,
  type NormalizedBlogPost,
  type NormalizedBlogPostResult
} from '@/lib/blog-posts';
import { createVirtualProductCategoryFromSlug } from '@/lib/categories';
import { createRequestId } from '@/lib/request-id';
import { buildBlogPostUrl } from '@/lib/urls';
import { buildBlogSeo, buildBlogMetaTitle } from '@/lib/blog-seo';
import { parsePageParam, resolveSearchParam } from '@/lib/search-params';
import {
  extractProductListingPlaceholders,
  loadCategoryListing,
  loadManualListing
} from './product-listing';
import {
  PRODUCT_LISTING_HEADING,
  type ProductCard,
  type ProductListingPlaceholder,
  type ProductListingRenderData,
  type ProductListingRequest,
  type ProductListingType
} from './product-listing.types';

export const runtime = 'nodejs';
export const revalidate = 300;

interface PageProps {
  params: { slug: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}

type SearchParamsMap = PageProps['searchParams'];

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
  { type: 'affiliate', urlKey: 'cta_affiliate_url', labelKey: 'cta_affiliate_label' },
  { type: 'stripe', urlKey: 'cta_stripe_url', labelKey: 'cta_stripe_label' },
  { type: 'paypal', urlKey: 'cta_paypal_url', labelKey: 'cta_paypal_label' }
] as const;

function truncateSummary(summary: string, maxLength = 160): string {
  return truncateDescription(summary, maxLength);
}


interface ListingEmptyState {
  type: ProductListingType;
  message: string;
  highlight?: string | null;
}

interface ListingSectionData {
  dataKey: string;
  heading: string;
  subtitle?: string | null;
  cards: ProductCard[];
  viewAllHref?: string;
  pagination?: ProductListingRenderData['pagination'];
  emptyState?: ListingEmptyState;
}

type ContentSegment =
  | { type: 'html'; key: string; html: string }
  | { type: 'listing'; key: string; data: ListingSectionData };

function cloneSearchParams(searchParams?: SearchParamsMap): URLSearchParams {
  const params = new URLSearchParams();
  if (!searchParams) {
    return params;
  }
  for (const [key, value] of Object.entries(searchParams)) {
    if (value === undefined) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          params.append(key, item);
        }
      }
    } else if (typeof value === 'string') {
      params.set(key, value);
    }
  }
  return params;
}

function buildListingPageHref(
  blogSlug: string,
  pageKey: string,
  page: number,
  searchParams?: SearchParamsMap
): string {
  const params = cloneSearchParams(searchParams);
  if (page <= 1) {
    params.delete(pageKey);
  } else {
    params.set(pageKey, String(page));
  }
  const query = params.toString();
  return query ? `/b/${blogSlug}?${query}` : `/b/${blogSlug}`;
}

function createListingSectionData(
  listing: ProductListingRenderData | null,
  placeholder: ProductListingPlaceholder,
  blogSlug: string
): ListingSectionData {
  const fallbackSlug = placeholder.config.slug ?? blogSlug;
  const fallbackCategory = createVirtualProductCategoryFromSlug(fallbackSlug);
  const normalizedLabel = placeholder.config.categoryLabel?.trim() ?? null;
  const heading = listing?.heading ?? PRODUCT_LISTING_HEADING;
  const cards = Array.isArray(listing?.cards) ? listing.cards : [];
  const subtitle = listing?.subtitle ?? normalizedLabel ?? fallbackCategory.name ?? null;
  const viewAllHref = listing?.viewAllHref;
  const pagination = listing?.pagination;
  const fallbackKey =
    placeholder.config.type === 'manual'
      ? 'manual-products'
      : `category-${fallbackCategory.slug}`;
  const dataKey = listing?.key ?? fallbackKey;

  let emptyState: ListingEmptyState | undefined;
  if (cards.length === 0) {
    if (placeholder.config.type === 'manual') {
      emptyState = {
        type: 'manual',
        message: 'No se encontraron productos relacionados para esta selección.'
      };
    } else {
      emptyState = {
        type: 'category',
        message: 'No hay productos publicados actualmente en la categoría',
        highlight: normalizedLabel ?? fallbackCategory.name ?? fallbackCategory.slug
      };
    }
  }

  return {
    dataKey,
    heading,
    subtitle: subtitle ?? null,
    cards,
    viewAllHref,
    pagination,
    emptyState
  };
}

function createStandaloneSectionData(listing: ProductListingRenderData): ListingSectionData {
  return {
    dataKey: listing.key,
    heading: listing.heading ?? PRODUCT_LISTING_HEADING,
    subtitle: listing.subtitle ?? null,
    cards: listing.cards ?? [],
    viewAllHref: listing.viewAllHref,
    pagination: listing.pagination
  };
}

function buildContentSegments(
  html: string,
  placeholders: ProductListingPlaceholder[],
  listingResults: (ProductListingRenderData | null)[],
  blogSlug: string
): ContentSegment[] {
  if (!html || placeholders.length === 0) {
    return html ? [{ type: 'html', key: 'content-0', html }] : [];
  }

  const segments: ContentSegment[] = [];
  const markerRegex = /__PRODUCT_LISTING_(\d+)__/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markerRegex.exec(html))) {
    const matchIndex = match.index ?? 0;
    if (matchIndex > lastIndex) {
      const chunk = html.slice(lastIndex, matchIndex);
      if (chunk.trim().length > 0) {
        segments.push({ type: 'html', key: `html-${segments.length}`, html: chunk });
      }
    }

    const placeholderIndex = Number.parseInt(match[1] ?? '', 10);
    const placeholder = placeholders[placeholderIndex];
    if (placeholder) {
      const listing = listingResults[placeholderIndex] ?? null;
      const data = createListingSectionData(listing, placeholder, blogSlug);
      segments.push({ type: 'listing', key: `listing-${placeholderIndex}`, data });
    }

    lastIndex = matchIndex + match[0].length;
  }

  const tail = html.slice(lastIndex);
  if (tail.trim().length > 0) {
    segments.push({ type: 'html', key: `html-${segments.length}`, html: tail });
  }

  return segments;
}

function RelatedProductsSection({
  data,
  blogSlug,
  searchParams
}: {
  data: ListingSectionData;
  blogSlug: string;
  searchParams?: SearchParamsMap;
}) {
  const { heading, subtitle, cards, viewAllHref, pagination, emptyState, dataKey } = data;
  const hasCards = cards.length > 0;
  const pages =
    pagination && pagination.totalPages > 1
      ? Array.from({ length: pagination.totalPages }, (_, index) => index + 1)
      : [];

  const sectionClassName = hasCards
    ? relatedStyles.relatedProducts
    : `${relatedStyles.relatedProducts} ${relatedStyles.emptySection}`;

  const listingAttribute = hasCards
    ? dataKey
    : emptyState?.type === 'manual'
      ? 'manual-empty'
      : 'empty';

  return (
    <section className={sectionClassName} data-product-listing={listingAttribute}>
      <header className={relatedStyles.header}>
        <div className={relatedStyles.headerText}>
          <h2 className={relatedStyles.title}>{heading}</h2>
          {subtitle ? <p className={relatedStyles.subtitle}>{subtitle}</p> : null}
        </div>
        {viewAllHref ? (
          <Link className={relatedStyles.viewAll} href={viewAllHref} prefetch>
            Ver todos
          </Link>
        ) : null}
      </header>
      {hasCards ? (
        <>
          <ProductListingGrid cards={cards} />
          {pages.length > 0 ? (
            <nav className={relatedStyles.pagination} aria-label="Paginación de productos relacionados">
              <div className={relatedStyles.paginationList}>
                {pages.map((pageNumber) => {
                  const href = buildListingPageHref(blogSlug, pagination!.pageKey, pageNumber, searchParams);
                  const isActive = pageNumber === pagination!.currentPage;
                  const className = isActive
                    ? `${relatedStyles.pageLink} ${relatedStyles.pageLinkActive}`
                    : relatedStyles.pageLink;
                  return (
                    <Link
                      key={pageNumber}
                      className={className}
                      href={href}
                      aria-current={isActive ? 'page' : undefined}
                      prefetch
                    >
                      {pageNumber}
                    </Link>
                  );
                })}
              </div>
            </nav>
          ) : null}
        </>
      ) : (
        <div className={relatedStyles.emptyState}>
          <p className={relatedStyles.emptyMessage}>
            {emptyState?.type === 'category' && emptyState.highlight ? (
              <>
                {emptyState.message}{' '}
                <strong className={relatedStyles.emptyHighlight}>{emptyState.highlight}</strong>.
              </>
            ) : (
              emptyState?.message ?? 'No se encontraron productos relacionados.'
            )}
          </p>
        </div>
      )}
    </section>
  );
}

export default async function BlogPostPage({ params, searchParams }: PageProps) {
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

  const manualProductSlugs = Array.isArray(normalized.product_slugs)
    ? normalized.product_slugs.filter((slug) => typeof slug === 'string' && slug.trim().length > 0)
    : [];
  const defaultCategorySlug =
    typeof normalized.category_slug === 'string' && normalized.category_slug.trim().length > 0
      ? normalized.category_slug.trim().toLowerCase()
      : normalized.slug;

  const contentExtraction = normalized.content_html
    ? extractProductListingPlaceholders(normalized.content_html)
    : { html: '', placeholders: [] };
  const { html: contentHtml, placeholders } = contentExtraction;
  const hasPlaceholders = placeholders.length > 0;

  const listingRequests: ProductListingRequest[] = [];
  if (hasPlaceholders) {
    let categoryIndex = 0;
    placeholders.forEach((placeholder, index) => {
      if (placeholder.config.type === 'manual') {
        listingRequests.push({ config: { type: 'manual', slug: null, categoryLabel: null }, pageKey: `manual-${index}` });
        return;
      }
      const slug = placeholder.config.slug ?? defaultCategorySlug;
      const pageKey = categoryIndex === 0 ? 'page' : `page${categoryIndex + 1}`;
      categoryIndex += 1;
      if (!slug) {
        listingRequests.push({ config: { type: 'category', slug: null, categoryLabel: placeholder.config.categoryLabel }, pageKey });
        return;
      }
      listingRequests.push({ config: { type: 'category', slug, categoryLabel: placeholder.config.categoryLabel }, pageKey });
    });
  } else if (manualProductSlugs.length > 0) {
    listingRequests.push({ config: { type: 'manual', slug: null, categoryLabel: null }, pageKey: 'manual-default' });
  } else if (defaultCategorySlug) {
    listingRequests.push({ config: { type: 'category', slug: defaultCategorySlug, categoryLabel: null }, pageKey: 'page' });
  }

  let manualListingCache: ProductListingRenderData | null | undefined;
  const categoryListings = new Map<string, ProductListingRenderData | null>();
  const listingResults: (ProductListingRenderData | null)[] = [];

  for (const request of listingRequests) {
    if (request.config.type === 'manual') {
      if (manualListingCache === undefined) {
        manualListingCache = await loadManualListing(manualProductSlugs);
      }
      listingResults.push(manualListingCache ?? null);
      continue;
    }

    const slug = request.config.slug ?? null;
    if (!slug) {
      listingResults.push(null);
      continue;
    }
    const cacheKey = `${slug}|${request.pageKey}`;
    if (!categoryListings.has(cacheKey)) {
      const pageValue = resolveSearchParam(searchParams?.[request.pageKey]);
      const pageParam = parsePageParam(pageValue);
      const listing = await loadCategoryListing({
        config: { ...request.config, slug },
        pageParam,
        pageKey: request.pageKey,
        requestId
      });
      categoryListings.set(cacheKey, listing);
    }
    listingResults.push(categoryListings.get(cacheKey) ?? null);
  }

  const hasStandaloneListings = !hasPlaceholders && listingResults.some((listing) => listing && listing.cards.length > 0);

  const contentSegments = hasPlaceholders
    ? buildContentSegments(contentHtml, placeholders, listingResults, normalized.slug)
    : null;

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
          <h1 className={`${styles.productTitle} ${blogStyles.title} bx-break`}>
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
          {hasPlaceholders && contentSegments && contentSegments.length > 0 ? (
            <article className={`${styles.productDescriptionContent} ${blogStyles.articleContent}`}>
              {contentSegments.map((segment) =>
                segment.type === 'html' ? (
                  <div key={segment.key} dangerouslySetInnerHTML={{ __html: segment.html }} />
                ) : (
                  <RelatedProductsSection
                    key={segment.key}
                    data={segment.data}
                    blogSlug={normalized.slug}
                    searchParams={searchParams}
                  />
                )
              )}
            </article>
          ) : (
            <article
              className={styles.productDescriptionContent}
              dangerouslySetInnerHTML={{ __html: normalized.content_html }}
            />
          )}
        </section>
      ) : null}
      {!hasPlaceholders && hasStandaloneListings
        ? listingResults.map((listing, index) =>
            listing && listing.cards.length > 0 ? (
              <RelatedProductsSection
                key={`${listing.key}-${index}`}
                data={createStandaloneSectionData(listing)}
                blogSlug={normalized.slug}
                searchParams={searchParams}
              />
            ) : null
          )
        : null}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: seo.jsonLd }}
        suppressHydrationWarning
      />
    </main>
  );
}
