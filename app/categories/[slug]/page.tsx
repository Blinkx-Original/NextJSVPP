import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import styles from "./page.module.css";
import {
  getPublishedCategoryBySlug,
  createVirtualProductCategoryFromSlug,
  resolveProductCategoryBySlugOrName
} from "@/lib/categories";
import { createRequestId } from "@/lib/request-id";
import { buildCategoriesHubUrl } from "@/lib/urls";
import { parsePageParam, resolveSearchParam } from "@/lib/search-params";
import {
  getAlgoliaSearchConfig,
  searchAlgoliaProducts,
  type AlgoliaProductHit
} from "@/lib/algolia-search";

export const runtime = "nodejs";
export const revalidate = 600;

const HITS_PER_PAGE = 8;

interface PageProps {
  params: { slug: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}

interface ProductCard {
  id: string;
  title: string;
  summary: string | null;
  price: string | null;
  image: string | null;
  href: string;
  categories: string[];
}

interface FacetSelection {
  value: string;
  queryKey: string;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const requestId = createRequestId();
  const category = await getPublishedCategoryBySlug(params.slug, { requestId });
  const productCategory =
    category && category.type === "product"
      ? category
      : await resolveProductCategoryBySlugOrName(params.slug, {
          requestId,
          hintName: category?.name ?? null
        });
  const host = headers().get("host") ?? undefined;
  const canonical = `${buildCategoriesHubUrl(host)}/${params.slug}`;
  const resolvedCategory =
    productCategory ?? category ?? createVirtualProductCategoryFromSlug(params.slug);
  const isBlog = resolvedCategory.type === "blog";
  const displayName = category?.name?.trim() ? category.name : resolvedCategory.name;
  const description =
    resolvedCategory.shortDescription ||
    (resolvedCategory !== category ? category?.shortDescription : null) ||
    (isBlog
      ? "Stories, news, and insights curated for this BlinkX blog category."
      : "Discover published products curated for this category on BlinkX Virtual Product Pages.");
  const title = `${displayName} | ${isBlog ? "Blog Category" : "Product Category"}`;
  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      title,
      description,
      url: canonical
    },
    twitter: {
      card: "summary_large_image",
      title,
      description
    }
  };
}

function resolveParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function extractFacetSelections(
  searchParams: PageProps["searchParams"]
): Map<string, FacetSelection> {
  const selections = new Map<string, FacetSelection>();
  if (!searchParams) {
    return selections;
  }
  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (key === "page") {
      continue;
    }
    const value = resolveParam(rawValue)?.trim();
    if (!value) {
      continue;
    }
    if (key === "category") {
      // Category slug is already encoded in the route; ignore this parameter here.
      continue;
    }
    selections.set(key, { value, queryKey: key });
  }
  return selections;
}

function buildFacetFilters(
  selections: Map<string, FacetSelection>,
  categorySlug: string
): Array<string | string[]> {
  const filters: Array<string | string[]> = [[`categories:${categorySlug}`]];
  selections.forEach(({ value }, facet) => {
    filters.push([`${facet}:${value}`]);
  });
  return filters;
}

function createBaseSearchParams(searchParams: PageProps["searchParams"]): URLSearchParams {
  const params = new URLSearchParams();
  if (!searchParams) {
    return params;
  }
  for (const [key, rawValue] of Object.entries(searchParams)) {
    const value = resolveParam(rawValue);
    if (value) {
      params.set(key, value);
    }
  }
  return params;
}

function resolveDisplayName(hit: AlgoliaProductHit): string {
  const candidates = [hit.title, hit.name, hit.sku, hit.slug, hit.objectID];
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      const trimmed = candidate.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return "Untitled product";
}

function resolveImage(hit: AlgoliaProductHit): string | null {
  if (typeof hit.image === "string" && hit.image.trim()) {
    return hit.image.trim();
  }
  if (Array.isArray(hit.images)) {
    const first = hit.images.find((value): value is string => typeof value === "string" && value.trim().length > 0);
    if (first) {
      return first.trim();
    }
  }
  return null;
}

function resolveHref(hit: AlgoliaProductHit): string {
  const slug = typeof hit.slug === "string" && hit.slug.trim() ? hit.slug.trim() : null;
  if (slug) {
    return `/p/${slug}`;
  }
  const wpUrl = typeof hit.wp_url === "string" && hit.wp_url.trim() ? hit.wp_url.trim() : null;
  if (wpUrl) {
    return wpUrl;
  }
  const url = typeof hit.url === "string" && hit.url.trim() ? hit.url.trim() : null;
  if (url) {
    return url;
  }
  return "#";
}

function formatPrice(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2
    }).format(value);
  }
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  return null;
}

function toProductCard(hit: AlgoliaProductHit): ProductCard {
  const categories: string[] = Array.isArray(hit.categories)
    ? hit.categories.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    : typeof hit.categories === "string" && hit.categories.trim().length > 0
    ? [hit.categories.trim()]
    : [];

  const id =
    (typeof hit.objectID === "string" && hit.objectID.trim()) ||
    (typeof hit.slug === "string" && hit.slug.trim()) ||
    resolveDisplayName(hit);

  return {
    id,
    title: resolveDisplayName(hit),
    summary: typeof hit.short_description === "string" && hit.short_description.trim()
      ? hit.short_description.trim()
      : null,
    price: formatPrice(hit.price),
    image: resolveImage(hit),
    href: resolveHref(hit),
    categories
  };
}

function formatFacetLabel(name: string): string {
  return name
    .split("_")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function buildFacetHref(
  basePath: string,
  baseParams: URLSearchParams,
  facetName: string,
  facetValue: string,
  isSelected: boolean
): string {
  const queryKey = facetName === "categories" ? "category" : facetName;
  const next = new URLSearchParams(baseParams.toString());
  if (isSelected) {
    next.delete(queryKey);
  } else {
    next.set(queryKey, facetValue);
  }
  next.delete("page");
  const query = next.toString();
  return query ? `${basePath}?${query}` : basePath;
}

const FACET_VALUE_LIMIT = 20;

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const config = getAlgoliaSearchConfig();
  const requestId = createRequestId();
  const pageParam = parsePageParam(resolveSearchParam(searchParams?.page));
  const matchedCategory = await getPublishedCategoryBySlug(params.slug, { requestId });
  const productCategory =
    matchedCategory && matchedCategory.type === "product"
      ? matchedCategory
      : await resolveProductCategoryBySlugOrName(params.slug, {
          requestId,
          hintName: matchedCategory?.name ?? null
        });
  const category =
    productCategory ?? matchedCategory ?? createVirtualProductCategoryFromSlug(params.slug);
  const displayName = matchedCategory?.name?.trim() ? matchedCategory.name : category.name;
  const displayDescription =
    category.shortDescription ||
    (category !== matchedCategory ? matchedCategory?.shortDescription : null);

  if (!config) {
    return (
      <main className={styles.page}>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>{displayName}</h1>
          {displayDescription ? <p className={styles.heroDescription}>{displayDescription}</p> : null}
          <p className={styles.heroNotice}>
            Algolia environment variables are missing. Please configure ALGOLIA_APP_ID, ALGOLIA_API_KEY, and ALGOLIA_INDEX to
            load products.
          </p>
        </section>
      </main>
    );
  }

  const selections = extractFacetSelections(searchParams);
  const facetFilters = buildFacetFilters(selections, category.slug);
  const baseParams = createBaseSearchParams(searchParams);

  let searchResult;
  try {
    searchResult = await searchAlgoliaProducts({
      page: pageParam,
      hitsPerPage: HITS_PER_PAGE,
      facetFilters,
      facets: ["*"]
    });
  } catch (error) {
    console.error("Algolia search failed", error);
    return (
      <main className={styles.page}>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>{displayName}</h1>
          {displayDescription ? <p className={styles.heroDescription}>{displayDescription}</p> : null}
          <p className={styles.heroNotice}>Unable to reach the Algolia index. Please verify the credentials and network connectivity.</p>
        </section>
      </main>
    );
  }

  const cards = searchResult.hits.map(toProductCard).filter((card) => Boolean(card.title));
  const totalPages = searchResult.nbPages > 0 ? searchResult.nbPages : 1;
  const currentPage = Math.min(Math.max(1, searchResult.page), totalPages);
  const paginationPages = Array.from({ length: totalPages }, (_, index) => index + 1);

  const facetGroups = Object.entries(searchResult.facets)
    .map(([name, values]) => ({
      name,
      values: Object.entries(values)
        .filter(([value, count]) => Boolean(value.trim()) && count > 0 && value !== "__empty")
        .sort((a, b) => b[1] - a[1])
        .slice(0, FACET_VALUE_LIMIT)
    }))
    .filter((group) => group.values.length > 0);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{displayName}</h1>
        {displayDescription ? <p className={styles.heroDescription}>{displayDescription}</p> : null}
      </section>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Filters</h2>
            <p className={styles.sidebarSubtitle}>Adjust the Algolia facets to refine this category.</p>
          </div>
          {facetGroups.length === 0 ? (
            <p className={styles.sidebarEmpty}>No facets available.</p>
          ) : (
            facetGroups.map((group) => (
              <div key={group.name} className={styles.facetGroup}>
                <h3 className={styles.facetTitle}>{formatFacetLabel(group.name)}</h3>
                <ul className={styles.facetList}>
                  {group.name === "categories"
                    ? group.values.map(([value, count]) => {
                        const isActive = value === category.slug;
                        const href = `/categories/${encodeURIComponent(value)}`;
                        const className = isActive
                          ? `${styles.facetLink} ${styles.facetLinkActive}`
                          : styles.facetLink;
                        return (
                          <li key={value} className={styles.facetItem}>
                            <Link className={className} href={href} prefetch>
                              <span className={styles.facetLabel}>{value}</span>
                              <span className={styles.facetCount}>{count}</span>
                            </Link>
                          </li>
                        );
                      })
                    : group.values.map(([value, count]) => {
                        const isSelected = selections.get(group.name)?.value === value;
                        const href = buildFacetHref(
                          `/categories/${encodeURIComponent(category.slug)}`,
                          baseParams,
                          group.name,
                          value,
                          isSelected
                        );
                        return (
                          <li key={value} className={styles.facetItem}>
                            <Link className={isSelected ? `${styles.facetLink} ${styles.facetLinkActive}` : styles.facetLink} href={href} prefetch>
                              <span className={styles.facetLabel}>{value}</span>
                              <span className={styles.facetCount}>{count}</span>
                            </Link>
                          </li>
                        );
                      })}
                </ul>
              </div>
            ))
          )}
        </aside>
        <section className={styles.content}>
          {cards.length === 0 ? (
            <div className={styles.emptyState}>No products found in this category.</div>
          ) : (
            <div className={styles.grid}>
              {cards.map((product) => (
                <article key={product.id} className={styles.card}>
                  <div className={styles.cardImageWrapper}>
                    {product.image ? (
                      <Image
                        src={product.image}
                        alt={product.title}
                        fill
                        className={styles.cardImage}
                        sizes="(max-width: 768px) 100vw, 320px"
                      />
                    ) : null}
                  </div>
                  <div className={styles.cardBody}>
                    <h3 className={styles.cardTitle}>{product.title}</h3>
                    {product.summary ? <p className={styles.cardSummary}>{product.summary}</p> : null}
                    {product.price ? <div className={styles.cardPrice}>{product.price}</div> : null}
                    {product.categories.length > 0 ? (
                      <ul className={styles.cardTags}>
                        {product.categories.map((categoryName) => (
                          <li key={categoryName}>{categoryName}</li>
                        ))}
                      </ul>
                    ) : null}
                    <div className={styles.cardFooter}>
                      <Link className={styles.cardLink} href={product.href} prefetch>
                        View Details
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {totalPages > 1 ? (
            <nav className={styles.pagination} aria-label="Pagination">
              <div className={styles.paginationList}>
                {paginationPages.map((pageNumber) => {
                  const isActive = pageNumber === currentPage;
                  const params = new URLSearchParams(baseParams.toString());
                  if (pageNumber === 1) {
                    params.delete("page");
                  } else {
                    params.set("page", String(pageNumber));
                  }
                  const query = params.toString();
                  const href = query
                    ? `/categories/${encodeURIComponent(category.slug)}?${query}`
                    : `/categories/${encodeURIComponent(category.slug)}`;
                  const className = isActive
                    ? `${styles.pageLink} ${styles.pageLinkActive}`
                    : styles.pageLink;
                  return (
                    <Link key={pageNumber} className={className} href={href} aria-current={isActive ? "page" : undefined} prefetch>
                      {pageNumber}
                    </Link>
                  );
                })}
              </div>
            </nav>
          ) : null}
        </section>
      </div>
    </main>
  );
}
