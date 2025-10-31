import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import he from 'he';
import styles from '../../p/[slug]/page.module.css';
import blogStyles from './page.module.css';
import relatedStyles from './related-products.module.css';
import { CTA_DEFAULT_LABELS, resolveCtaLabel } from '@/lib/product-cta';
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
  loadManualListing,
  type ProductCard,
  type ProductListingPlaceholder,
  type ProductListingRenderData,
  type ProductListingRequest
} from './product-listing';

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


function escapeHtml(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }
  return he.encode(value, { useNamedReferences: true });
}

function escapeAttribute(value: string | null | undefined): string {
  if (typeof value !== 'string') {
    return '';
  }
  return he.encode(value, { useNamedReferences: true });
}

function buildProductCardHtml(card: ProductCard): string {
  const title = escapeHtml(card.title);
  const summary = card.shortSummary ? `<p class="${relatedStyles.cardSummary}">${escapeHtml(card.shortSummary)}</p>` : '';
  const price = card.price ? `<p class="${relatedStyles.cardPrice}">${escapeHtml(card.price)}</p>` : '';
  const productHref = `/p/${encodeURIComponent(card.slug)}`;
  const image = card.primaryImage
    ? `<img src="${escapeAttribute(card.primaryImage)}" alt="${title}" class="${relatedStyles.cardImage}" loading="lazy" />`
    : '';

  return `
    <article class="${relatedStyles.card}">
      <div class="${relatedStyles.cardImageWrapper}">
        ${image}
      </div>
      <div class="${relatedStyles.cardBody}">
        <h3 class="${relatedStyles.cardTitle}">${title}</h3>
        ${summary}
        ${price}
        <div class="${relatedStyles.cardFooter}">
          <a class="${relatedStyles.cardLink}" href="${escapeAttribute(productHref)}" data-prefetch="true">
            Ver producto
          </a>
        </div>
      </div>
    </article>
  `;
}

function buildPaginationHtml(
  data: ProductListingRenderData,
  blogSlug: string,
  searchParams?: SearchParamsMap
): string {
  const pagination = data.pagination;
  if (!pagination || pagination.totalPages <= 1) {
    return '';
  }

  const pages = Array.from({ length: pagination.totalPages }, (_, index) => index + 1);
  const links = pages
    .map((pageNumber) => {
      const href = buildListingPageHref(blogSlug, pagination.pageKey, pageNumber, searchParams);
      const isActive = pageNumber === pagination.currentPage;
      const className = [relatedStyles.pageLink, isActive ? relatedStyles.pageLinkActive : '']
        .filter(Boolean)
        .join(' ');
      const ariaCurrent = isActive ? ' aria-current="page"' : '';
      return `<a class="${className}" href="${escapeAttribute(href)}" data-prefetch="true"${ariaCurrent}>${pageNumber}</a>`;
    })
    .join('');

  return `
    <nav class="${relatedStyles.pagination}" aria-label="Paginación de productos relacionados">
      <div class="${relatedStyles.paginationList}">
        ${links}
      </div>
    </nav>
  `;
}

function renderEmbeddedListingHtml(
  listing: ProductListingRenderData | null,
  placeholder: ProductListingPlaceholder,
  blogSlug: string,
  searchParams?: SearchParamsMap
): string {
  const hasCards = listing && listing.cards && listing.cards.length > 0;
  const heading = escapeHtml(listing?.heading ?? 'Productos relacionados');
  const subtitleText = listing?.subtitle ?? null;
  const subtitle = subtitleText ? `<p class="${relatedStyles.subtitle}">${escapeHtml(subtitleText)}</p>` : '';
  const viewAll = listing?.viewAllHref
    ? `<a class="${relatedStyles.viewAll}" href="${escapeAttribute(listing.viewAllHref)}" data-prefetch="true">Ver todos</a>`
    : '';

  if (!hasCards) {
    const fallbackSlug = placeholder.config.slug ?? blogSlug;
    const fallbackCategory = createVirtualProductCategoryFromSlug(fallbackSlug);
    const resolvedSubtitle = subtitleText ?? fallbackCategory.name;
    const emptyMessage =
      placeholder.config.type === 'manual'
        ? 'No se encontraron productos relacionados para esta selección.'
        : `No hay productos publicados actualmente en la categoría <strong class="${relatedStyles.emptyHighlight}">${escapeHtml(
            fallbackCategory.name
          )}</strong>.`;

    const subtitleHtml = resolvedSubtitle
      ? `<p class="${relatedStyles.subtitle}">${escapeHtml(resolvedSubtitle)}</p>`
      : '';

    return `
      <section class="${relatedStyles.relatedProducts} ${relatedStyles.emptySection}" data-product-listing="empty">
        <header class="${relatedStyles.header}">
          <div class="${relatedStyles.headerText}">
            <h2 class="${relatedStyles.title}">${heading}</h2>
            ${subtitleHtml}
          </div>
          ${viewAll}
        </header>
        <div class="${relatedStyles.emptyState}">
          <p class="${relatedStyles.emptyMessage}">${emptyMessage}</p>
        </div>
      </section>
    `;
  }

  const cardsHtml = listing.cards.map((card) => buildProductCardHtml(card)).join('');
  const pagination = buildPaginationHtml(listing, blogSlug, searchParams);

  return `
    <section class="${relatedStyles.relatedProducts}" data-product-listing="${escapeHtml(listing.key)}">
      <header class="${relatedStyles.header}">
        <div class="${relatedStyles.headerText}">
          <h2 class="${relatedStyles.title}">${heading}</h2>
          ${subtitle}
        </div>
        ${viewAll}
      </header>
      <div class="${relatedStyles.grid}">
        ${cardsHtml}
      </div>
      ${pagination}
    </section>
  `;
}

function injectListingsIntoHtml(
  html: string,
  placeholders: ProductListingPlaceholder[],
  listingResults: (ProductListingRenderData | null)[],
  blogSlug: string,
  searchParams?: SearchParamsMap
): string {
  if (!html || placeholders.length === 0) {
    return html;
  }

  let output = html;
  placeholders.forEach((placeholder, index) => {
    const listing = listingResults[index] ?? null;
    const replacement = renderEmbeddedListingHtml(listing, placeholder, blogSlug, searchParams);
    output = output.replace(placeholder.marker, replacement);
  });

  return output;
}

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

function RelatedProductsSection({
  data,
  blogSlug,
  searchParams
}: {
  data: ProductListingRenderData;
  blogSlug: string;
  searchParams?: SearchParamsMap;
}) {
  const { heading, subtitle, cards, viewAllHref, pagination } = data;
  if (!cards || cards.length === 0) {
    return null;
  }

  const pages = pagination && pagination.totalPages > 1
    ? Array.from({ length: pagination.totalPages }, (_, index) => index + 1)
    : [];

  return (
    <section className={relatedStyles.relatedProducts}>
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
      <div className={relatedStyles.grid}>
        {cards.map((product) => (
          <article key={product.id} className={relatedStyles.card}>
            <div className={relatedStyles.cardImageWrapper}>
              {product.primaryImage ? (
                <Image
                  src={product.primaryImage}
                  alt={product.title}
                  fill
                  className={relatedStyles.cardImage}
                  sizes="(max-width: 768px) 100vw, 320px"
                />
              ) : null}
            </div>
            <div className={relatedStyles.cardBody}>
              <h3 className={relatedStyles.cardTitle}>{product.title}</h3>
              {product.shortSummary ? (
                <p className={relatedStyles.cardSummary}>{product.shortSummary}</p>
              ) : null}
              {product.price ? <div className={relatedStyles.cardPrice}>{product.price}</div> : null}
              <div className={relatedStyles.cardFooter}>
                <Link className={relatedStyles.cardLink} href={`/p/${product.slug}`} prefetch>
                  Ver producto
                </Link>
              </div>
            </div>
          </article>
        ))}
      </div>
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

  const embeddedContentHtml = hasPlaceholders
    ? injectListingsIntoHtml(contentHtml, placeholders, listingResults, normalized.slug, searchParams)
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
          {hasPlaceholders && embeddedContentHtml !== null ? (
            <article
              className={`${styles.productDescriptionContent} ${blogStyles.articleContent}`}
              dangerouslySetInnerHTML={{ __html: embeddedContentHtml }}
            />
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
                data={listing}
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
