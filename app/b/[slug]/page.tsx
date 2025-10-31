import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from '../../p/[slug]/page.module.css';
import blogStyles from './page.module.css';
import relatedStyles from './related-products.module.css';
import { CTA_DEFAULT_LABELS, resolveCtaLabel } from '@/lib/product-cta';
import {
  getNormalizedPublishedBlogPost,
  type NormalizedBlogPost,
  type NormalizedBlogPostResult
} from '@/lib/blog-posts';
import {
  createVirtualProductCategoryFromSlug,
  getPublishedCategoryBySlug,
  getPublishedProductsForCategory,
  type CategoryProductSummary
} from '@/lib/categories';
import { getPublishedProductsBySlugs, type NormalizedProductResult } from '@/lib/products';
import { createRequestId } from '@/lib/request-id';
import { buildBlogPostUrl } from '@/lib/urls';
import { buildBlogSeo, buildBlogMetaTitle } from '@/lib/blog-seo';
import { parsePageParam, resolveSearchParam } from '@/lib/search-params';

export const runtime = 'nodejs';
export const revalidate = 300;

const PAGE_SIZE = 10;

interface PageProps {
  params: { slug: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}

type SearchParamsMap = PageProps['searchParams'];

interface ProductCard {
  id: string;
  slug: string;
  title: string;
  shortSummary: string | null;
  price: string | null;
  primaryImage: string | null;
}

interface ProductListingRenderData {
  key: string;
  heading: string;
  subtitle?: string;
  cards: ProductCard[];
  viewAllHref?: string;
  pagination?: {
    pageKey: string;
    currentPage: number;
    totalPages: number;
  };
}

type ProductListingType = 'category' | 'manual';

interface ProductListingConfig {
  type: ProductListingType;
  slug: string | null;
}

interface ProductListingPlaceholder {
  config: ProductListingConfig;
}

interface ProductListingRequest {
  config: ProductListingConfig;
  pageKey: string;
}

interface CategoryListingOptions {
  slug: string;
  pageParam: number;
  pageKey: string;
  requestId: string;
}

const MANUAL_LISTING_KEYWORDS = new Set([
  'manual',
  'products',
  'productslugs',
  'product_slugs',
  'manualproducts',
  'manual-listing',
  'manualproductslisting',
  'productlistingmanual',
  'productos',
  'lista-manual'
]);

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

function toCategoryProductCards(products: CategoryProductSummary[]): ProductCard[] {
  return products.map((product) => ({
    id: product.id.toString(),
    slug: product.slug,
    title: product.title,
    shortSummary: product.shortSummary,
    price: product.price,
    primaryImage: product.primaryImage
  }));
}

function normalizeId(value: unknown, fallback: string): string {
  if (typeof value === 'bigint') {
    return value.toString(10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString(10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
}

function toManualProductCards(results: NormalizedProductResult[]): ProductCard[] {
  return results
    .map((result) => {
      const slug = result.normalized.slug;
      if (!slug) {
        return null;
      }
      const id = normalizeId((result.raw as { id?: unknown })?.id, slug);
      const images = Array.isArray(result.normalized.images) ? result.normalized.images : [];
      const primaryImage = images.length > 0 ? images[0]! : null;
      const title = result.normalized.title_h1 || slug;
      const shortSummary = result.normalized.short_summary || null;
      const price = result.normalized.price || null;
      return {
        id,
        slug,
        title,
        shortSummary,
        price,
        primaryImage
      } satisfies ProductCard;
    })
    .filter((card): card is ProductCard => card !== null);
}

function sanitizeSlugCandidate(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const normalized = trimmed.toLowerCase().replace(/[_\s]+/g, '-');
  const sanitized = normalized.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return sanitized || null;
}

function convertIndicatorSyntax(html: string): string {
  const toComment = (descriptor?: string) => {
    const normalizedDescriptor = typeof descriptor === 'string' ? descriptor.trim() : '';
    return `<!-- product-listing${normalizedDescriptor ? ` ${normalizedDescriptor}` : ''} -->`;
  };

  return html
    .replace(/\[\[\s*product[\s_-]*listing(?:\s*(?::|=|\s+)\s*([^\]]+))?\s*\]\]/gi, (_, descriptor) => toComment(descriptor))
    .replace(/\{\{\s*product[\s_-]*listing(?:\s*(?::|=|\s+)\s*([^}]+))?\s*\}\}/gi, (_, descriptor) => toComment(descriptor))
    .replace(/%%\s*product[\s_-]*listing(?:\s*(?::|=|\s+)([^%]+))?%%/gi, (_, descriptor) => toComment(descriptor))
    .replace(/\[\s*product[\s_-]*listing(?:\s*(?::|=|\s+)\s*([^\]]+))?\s*\]/gi, (_, descriptor) => toComment(descriptor));
}

function parseProductListingConfig(details: string | null | undefined): ProductListingConfig {
  const defaultConfig: ProductListingConfig = { type: 'category', slug: null };
  if (!details) {
    return defaultConfig;
  }

  const trimmed = details.replace(/-->/g, '').trim();
  if (!trimmed) {
    return defaultConfig;
  }

  const collapsed = trimmed.replace(/\s+/g, '').toLowerCase();
  if (MANUAL_LISTING_KEYWORDS.has(collapsed)) {
    return { type: 'manual', slug: null };
  }

  const manualAttrMatch = trimmed.match(/(?:type|source|mode)\s*(?::|=)\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  if (manualAttrMatch) {
    const candidate = (manualAttrMatch[1] ?? manualAttrMatch[2] ?? manualAttrMatch[3] ?? '')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (MANUAL_LISTING_KEYWORDS.has(candidate)) {
      return { type: 'manual', slug: null };
    }
  }

  const slugAttrMatch = trimmed.match(/(?:category|slug|categoria|cat)\s*(?::|=)\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  if (slugAttrMatch) {
    const slugCandidate = slugAttrMatch[1] ?? slugAttrMatch[2] ?? slugAttrMatch[3];
    const slug = sanitizeSlugCandidate(slugCandidate);
    if (slug) {
      return { type: 'category', slug };
    }
  }

  const tokens = trimmed.split(/\s+/);
  for (const token of tokens) {
    const [rawKey, rawValue] = token.split(/[:=]/, 2);
    if (rawValue !== undefined) {
      const value = rawValue.trim();
      const normalizedValue = value.replace(/\s+/g, '').toLowerCase();
      if (['type', 'source', 'mode'].includes(rawKey.trim().toLowerCase())) {
        if (MANUAL_LISTING_KEYWORDS.has(normalizedValue)) {
          return { type: 'manual', slug: null };
        }
        continue;
      }
      if (['slug', 'category', 'categoria', 'cat'].includes(rawKey.trim().toLowerCase())) {
        const slug = sanitizeSlugCandidate(value);
        if (slug) {
          return { type: 'category', slug };
        }
      }
      continue;
    }

    const normalizedToken = token.replace(/\s+/g, '').toLowerCase();
    if (MANUAL_LISTING_KEYWORDS.has(normalizedToken)) {
      return { type: 'manual', slug: null };
    }
    const slug = sanitizeSlugCandidate(token);
    if (slug) {
      return { type: 'category', slug };
    }
  }

  const slug = sanitizeSlugCandidate(trimmed);
  if (slug) {
    return { type: 'category', slug };
  }

  return defaultConfig;
}

function extractProductListingPlaceholders(content: string): {
  segments: string[];
  placeholders: ProductListingPlaceholder[];
} {
  if (!content) {
    return { segments: [''], placeholders: [] };
  }

  const normalizedContent = convertIndicatorSyntax(content);
  const regex = /<!--\s*product[\s_-]*listing(?<details>[\s\S]*?)-->/gi;
  const segments: string[] = [];
  const placeholders: ProductListingPlaceholder[] = [];

  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalizedContent)) !== null) {
    const start = match.index;
    segments.push(normalizedContent.slice(lastIndex, start));
    const details = match.groups?.details ?? '';
    const config = parseProductListingConfig(details);
    placeholders.push({ config });
    lastIndex = start + match[0].length;
  }

  segments.push(normalizedContent.slice(lastIndex));
  return { segments, placeholders };
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

async function loadCategoryListing(options: CategoryListingOptions): Promise<ProductListingRenderData | null> {
  const { slug, pageParam, pageKey, requestId } = options;
  const trimmedSlug = slug.trim();
  if (!trimmedSlug) {
    return null;
  }

  const category =
    (await getPublishedCategoryBySlug(trimmedSlug, { requestId })) ??
    createVirtualProductCategoryFromSlug(trimmedSlug);

  const offset = (pageParam - 1) * PAGE_SIZE;
  let { products, totalCount } = await getPublishedProductsForCategory(
    { id: category.id, slug: category.slug, name: category.name },
    {
      limit: PAGE_SIZE,
      offset,
      requestId
    }
  );

  if (totalCount <= 0 || products.length === 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  let currentPage = pageParam;
  if (pageParam > totalPages) {
    currentPage = totalPages;
    const lastOffset = (totalPages - 1) * PAGE_SIZE;
    ({ products } = await getPublishedProductsForCategory(
      { id: category.id, slug: category.slug, name: category.name },
      {
        limit: PAGE_SIZE,
        offset: lastOffset,
        requestId
      }
    ));
  }

  const cards = toCategoryProductCards(products);
  if (cards.length === 0) {
    return null;
  }

  return {
    key: `category-${category.slug}`,
    heading: 'Productos relacionados',
    subtitle: category.name,
    cards,
    viewAllHref: `/categories/${category.slug}`,
    pagination:
      totalPages > 1
        ? {
            pageKey,
            currentPage,
            totalPages
          }
        : undefined
  };
}

async function loadManualListing(productSlugs: string[]): Promise<ProductListingRenderData | null> {
  if (!Array.isArray(productSlugs) || productSlugs.length === 0) {
    return null;
  }

  const results = await getPublishedProductsBySlugs(productSlugs);
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const cards = toManualProductCards(results);
  if (cards.length === 0) {
    return null;
  }

  return {
    key: 'manual-products',
    heading: 'Productos relacionados',
    cards
  };
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
    : { segments: [''], placeholders: [] };
  const { segments, placeholders } = contentExtraction;
  const hasPlaceholders = placeholders.length > 0;

  const listingRequests: ProductListingRequest[] = [];
  if (hasPlaceholders) {
    let categoryIndex = 0;
    placeholders.forEach((placeholder, index) => {
      if (placeholder.config.type === 'manual') {
        listingRequests.push({ config: { type: 'manual', slug: null }, pageKey: `manual-${index}` });
        return;
      }
      const slug = placeholder.config.slug ?? defaultCategorySlug;
      const pageKey = categoryIndex === 0 ? 'page' : `page${categoryIndex + 1}`;
      categoryIndex += 1;
      listingRequests.push({ config: { type: 'category', slug }, pageKey });
    });
  } else if (manualProductSlugs.length > 0) {
    listingRequests.push({ config: { type: 'manual', slug: null }, pageKey: 'manual-default' });
  } else if (defaultCategorySlug) {
    listingRequests.push({ config: { type: 'category', slug: defaultCategorySlug }, pageKey: 'page' });
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

    const slug = request.config.slug ?? defaultCategorySlug;
    if (!slug) {
      listingResults.push(null);
      continue;
    }
    const cacheKey = `${slug}|${request.pageKey}`;
    if (!categoryListings.has(cacheKey)) {
      const pageValue = resolveSearchParam(searchParams?.[request.pageKey]);
      const pageParam = parsePageParam(pageValue);
      const listing = await loadCategoryListing({
        slug,
        pageParam,
        pageKey: request.pageKey,
        requestId
      });
      categoryListings.set(cacheKey, listing);
    }
    listingResults.push(categoryListings.get(cacheKey) ?? null);
  }

  const hasStandaloneListings = !hasPlaceholders && listingResults.some((listing) => listing && listing.cards.length > 0);

  let articleNodes: ReactNode[] | null = null;
  if (hasPlaceholders) {
    articleNodes = [];
    let listingIndex = 0;
    for (let index = 0; index < segments.length; index += 1) {
      const html = segments[index];
      if (html && html.trim()) {
        articleNodes.push(
          <div
            key={`segment-${index}`}
            className={blogStyles.contentSegment}
            dangerouslySetInnerHTML={{ __html: html }}
          />
        );
      }
      if (listingIndex < listingResults.length) {
        const listing = listingResults[listingIndex];
        listingIndex += 1;
        if (listing && listing.cards.length > 0) {
          articleNodes.push(
            <RelatedProductsSection
              key={`${listing.key}-${index}`}
              data={listing}
              blogSlug={normalized.slug}
              searchParams={searchParams}
            />
          );
        }
      }
    }
  }

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
          {hasPlaceholders ? (
            <article className={`${styles.productDescriptionContent} ${blogStyles.articleContent}`}>
              {articleNodes?.length ? articleNodes : null}
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
