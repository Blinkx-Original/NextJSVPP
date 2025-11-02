import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";

import styles from "../categories/catalog.module.css";

import {
  getAlgoliaSearchConfig,
  searchAlgoliaProducts,
  type AlgoliaProductHit
} from "@/lib/algolia-search";
import { getSiteUrl } from "@/lib/urls";
import CategorySelect from "../categories/CategorySelect";

const HITS_PER_PAGE = 8;

export const runtime = "nodejs";
export const revalidate = 0;

interface PageSearchParams {
  [key: string]: string | string[] | undefined;
}

interface PageProps {
  searchParams?: PageSearchParams;
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

function resolveParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

function parsePage(value: string | undefined): number {
  if (!value) {
    return 1;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return parsed;
}

function parseQuery(value: string | undefined): string {
  if (!value) {
    return "";
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : "";
}

function extractFacetSelections(searchParams: PageSearchParams | undefined): Map<string, FacetSelection> {
  const selections = new Map<string, FacetSelection>();
  if (!searchParams) {
    return selections;
  }
  for (const [key, rawValue] of Object.entries(searchParams)) {
    if (key === "page" || key === "q") {
      continue;
    }
    const value = resolveParam(rawValue)?.trim();
    if (!value) {
      continue;
    }
    if (key === "category") {
      selections.set("categories", { value, queryKey: "category" });
    } else {
      selections.set(key, { value, queryKey: key });
    }
  }
  return selections;
}

function buildFacetFilters(selections: Map<string, FacetSelection>): Array<string | string[]> {
  const filters: Array<string | string[]> = [];
  selections.forEach(({ value }, facet) => {
    filters.push([`${facet}:${value}`]);
  });
  return filters;
}

function createBaseSearchParams(searchParams: PageSearchParams | undefined): URLSearchParams {
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

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const host = headers().get("host") ?? undefined;
  const siteUrl = getSiteUrl(host);
  const query = parseQuery(resolveParam(searchParams?.q));
  const title = query ? `Search results for "${query}" | BlinkX Virtual Product Pages` : "Search products | BlinkX Virtual Product Pages";
  const description = query
    ? `Explore Algolia-powered product matches for \"${query}\" with detailed cards, pricing, and quick links.`
    : "Discover Algolia-powered product search results with filtering tools and product cards.";
  const canonicalBase = `${siteUrl}/search`;
  const canonical = query ? `${canonicalBase}?q=${encodeURIComponent(query)}` : canonicalBase;

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

export default async function SearchPage({ searchParams }: PageProps) {
  const config = getAlgoliaSearchConfig();
  if (!config) {
    return (
      <main className={styles.page}>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>Search products</h1>
          <p className={styles.heroDescription}>
            Algolia environment variables are missing. Please configure ALGOLIA_APP_ID, ALGOLIA_API_KEY, and ALGOLIA_INDEX.
          </p>
        </section>
      </main>
    );
  }

  const query = parseQuery(resolveParam(searchParams?.q));
  const pageParam = parsePage(resolveParam(searchParams?.page));
  const selections = extractFacetSelections(searchParams);
  const facetFilters = buildFacetFilters(selections);
  const baseParams = createBaseSearchParams(searchParams);

  let searchResult = {
    hits: [] as AlgoliaProductHit[],
    nbHits: 0,
    page: 1,
    nbPages: 0,
    facets: {} as Record<string, Record<string, number>>
  };

  if (query) {
    try {
      searchResult = await searchAlgoliaProducts({
        query,
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
            <h1 className={styles.heroTitle}>Search products</h1>
            <p className={styles.heroDescription}>
              Unable to reach the Algolia index. Please verify the credentials and network connectivity.
            </p>
          </section>
        </main>
      );
    }
  }

  const cards = searchResult.hits.map(toProductCard).filter((card) => Boolean(card.title));
  const totalPages = searchResult.nbPages > 0 ? searchResult.nbPages : 1;
  const currentPage = Math.min(Math.max(1, searchResult.page), totalPages);
  const paginationPages = Array.from({ length: totalPages }, (_, index) => index + 1);
  const selectedCategory = selections.get("categories")?.value ?? null;

  const categoriesFacet = searchResult.facets.categories ?? {};
  const categoryOptions = Object.entries(categoriesFacet)
    .filter(([, count]) => count > 0)
    .slice(0, FACET_VALUE_LIMIT)
    .map(([value]) => ({ slug: value, name: value }));

  const facetGroups = Object.entries(searchResult.facets)
    .map(([name, values]) => ({
      name,
      values: Object.entries(values)
        .filter(([value, count]) => Boolean(value.trim()) && count > 0 && value !== "__empty")
        .sort((a, b) => b[1] - a[1])
        .slice(0, FACET_VALUE_LIMIT)
    }))
    .filter((group) => group.values.length > 0);

  const hasQuery = Boolean(query);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Search products</h1>
        <p className={styles.heroDescription}>
          {hasQuery
            ? `Showing Algolia-powered matches for \"${query}\".`
            : "Use the header search box to explore Algolia-powered product listings."}
        </p>
      </section>
      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <div className={styles.sidebarHeader}>
            <h2 className={styles.sidebarTitle}>Filters</h2>
            <p className={styles.sidebarSubtitle}>Refine the grid with live Algolia facets.</p>
          </div>
          {facetGroups.length === 0 ? (
            <p className={styles.sidebarEmpty}>No facets available.</p>
          ) : (
            facetGroups.map((group) => (
              <div key={group.name} className={styles.facetGroup}>
                <h3 className={styles.facetTitle}>{formatFacetLabel(group.name)}</h3>
                <ul className={styles.facetList}>
                  {group.values.map(([value, count]) => {
                    const isSelected = selections.get(group.name)?.value === value;
                    const href = buildFacetHref("/search", baseParams, group.name, value, isSelected);
                    return (
                      <li key={value} className={styles.facetItem}>
                        <Link
                          className={isSelected ? `${styles.facetLink} ${styles.facetLinkActive}` : styles.facetLink}
                          href={href}
                          prefetch
                        >
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
          <div className={styles.controls}>
            <CategorySelect categories={categoryOptions} selectedSlug={selectedCategory ?? undefined} />
          </div>
          {selectedCategory ? (
            <div className={styles.selectedBadge}>Category: {selectedCategory}</div>
          ) : null}
          {!hasQuery ? (
            <div className={styles.emptyState}>Enter a search query to see matching products.</div>
          ) : cards.length === 0 ? (
            <div className={styles.emptyState}>No products found for the current selection.</div>
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
                        {product.categories.map((category) => (
                          <li key={category}>{category}</li>
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
          {hasQuery && totalPages > 1 ? (
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
                  const queryString = params.toString();
                  const href = queryString ? `/search?${queryString}` : "/search";
                  const className = isActive ? `${styles.pageLink} ${styles.pageLinkActive}` : styles.pageLink;
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
