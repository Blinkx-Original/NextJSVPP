import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
// Importing notFound is unnecessary on this page because we do not
// explicitly throw 404 errors in the categories hub.  Unknown
// categories simply result in an empty state.
import styles from "./catalog.module.css";
import CategorySelect from "./CategorySelect";
import {
  getPublishedCategories,
  getPublishedCategoryBySlug,
  getPublishedProductsForCategory,
  type CategorySummary,
  type CategoryProductSummary
} from "@/lib/categories";
import { createRequestId } from "@/lib/request-id";
import { buildCategoriesHubUrl } from "@/lib/urls";

// The number of products to display per page when viewing a selected
// category.  This matches the PAGE_SIZE used by the category detail
// pages to keep pagination consistent.
const PAGE_SIZE = 10;

// Metadata for the categories landing page.  This page allows users
// to select a category and browse its products.  The canonical URL
// points to the root of the categories hub without any query
// parameters.
export async function generateMetadata(): Promise<Metadata> {
  const host = headers().get("host") ?? undefined;
  const canonical = buildCategoriesHubUrl(host);
  const title = "Browse Product Categories | BlinkX Virtual Product Pages";
  const description =
    "Explore published product categories, select a category from the menu, and browse the curated products within.";
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

interface PageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

/**
 * Resolve a query string value that may be supplied as an array or a
 * string.  Next.js serialises duplicate parameters into arrays; we
 * normalise by taking the first value.  Missing or empty values
 * return undefined.
 */
function resolveParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

/**
 * Parse the page number from the query string.  Invalid or missing
 * values default to page 1.  Pages are 1‑indexed in the UI.
 */
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

/**
 * Convert a CategoryProductSummary into a shape suitable for
 * rendering.  The id is stringified for use as a React key; the
 * primary image is extracted from the array of images returned by the
 * database.
 */
function toProductCards(products: CategoryProductSummary[]) {
  return products.map((product) => ({
    id: product.id.toString(),
    slug: product.slug,
    title: product.title,
    shortSummary: product.shortSummary,
    price: product.price,
    primaryImage: product.primaryImage
  }));
}

/**
 * Build a URL for navigating to a page of products for the selected
 * category.  The slug is included as the `category` query
 * parameter.  Only the `page` parameter is added when greater than 1.
 */
function buildPageHref(slug: string, page: number): string {
  const params = new URLSearchParams();
  params.set("category", slug);
  if (page > 1) {
    params.set("page", String(page));
  }
  const query = params.toString();
  return query ? `/categories?${query}` : "/categories";
}

/**
 * The main categories page.  This server component fetches a list of
 * published product categories to populate the drop‑down and, if a
 * specific category is selected via the `category` query parameter,
 * fetches the products for that category.  Pagination is supported
 * through a `page` parameter.
 */
export default async function CategoriesPage({ searchParams }: PageProps) {
  const requestId = createRequestId();
  // Extract the selected category slug and page number from the
  // query string.  Missing values default to undefined for slug and
  // 1 for page.
  const slugParam = resolveParam(searchParams?.category);
  const pageParam = parsePage(resolveParam(searchParams?.page));

  // Fetch all published categories without filtering by type.  Some databases
  // may contain inconsistent `type` values (e.g. trailing whitespace or
  // plural forms).  The normalization performed by `getPublishedCategories`
  // ensures the returned records have a consistent `type` field of either
  // "product" or "blog".  We filter to product categories after fetching.
  const { categories: allCategories } = await getPublishedCategories({
    // Do not specify a type here; instead filter the normalized results.
    limit: 1000,
    offset: 0,
    requestId
  });
  // Filter to only product categories.  The `type` field on CategorySummary is
  // normalised by the library so any unrecognised values become "product".
  const productCategories = allCategories.filter((c) => c.type === "product");
  // Map to the simple objects expected by the CategorySelect component.
  const selectOptions = productCategories.map((c) => ({ slug: c.slug, name: c.name }));

  // Resolve the selected category.  If a slug is provided but does
  // not correspond to a published category we treat it as unknown.
  let selectedCategory: CategorySummary | null = null;
  if (slugParam) {
    selectedCategory = await getPublishedCategoryBySlug(slugParam, { requestId });
  }
  let products: CategoryProductSummary[] = [];
  let totalCount = 0;
  let totalPages = 0;
  let currentPage = pageParam;
  if (selectedCategory) {
    // Determine the offset based on the current page.  Page numbers are
    // 1‑indexed so subtract 1 when computing the offset.
    const offset = (pageParam - 1) * PAGE_SIZE;
    const result = await getPublishedProductsForCategory(
      { id: selectedCategory.id, slug: selectedCategory.slug, name: selectedCategory.name },
      {
        limit: PAGE_SIZE,
        offset,
        requestId
      }
    );
    products = result.products;
    totalCount = result.totalCount;
    totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    // If the requested page exceeds the total pages but there are
    // products, adjust to the last page and re‑fetch the products for
    // that page.  This ensures deep links remain valid when items
    // are removed from a category.
    if (pageParam > totalPages && totalCount > 0) {
      currentPage = totalPages;
      const lastOffset = (totalPages - 1) * PAGE_SIZE;
      const lastResult = await getPublishedProductsForCategory(
        { id: selectedCategory.id, slug: selectedCategory.slug, name: selectedCategory.name },
        {
          limit: PAGE_SIZE,
          offset: lastOffset,
          requestId
        }
      );
      products = lastResult.products;
    }
  }

  const cards = toProductCards(products);
  const paginationPages = Array.from({ length: totalPages }, (_, index) => index + 1);

  return (
    <main className={styles.page}>
      {/* Top controls: category selector */}
      <div className={styles.controls}>
        <CategorySelect categories={selectOptions} selectedSlug={slugParam ?? undefined} />
      </div>
      {/* Display hero information for the selected category, if any */}
      {selectedCategory ? (
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>{selectedCategory.name}</h1>
          {selectedCategory.shortDescription ? (
            <p className={styles.heroDescription}>{selectedCategory.shortDescription}</p>
          ) : null}
        </section>
      ) : null}
      {/* Render the product cards or an empty state if no products are found */}
      {selectedCategory ? (
        cards.length === 0 ? (
          <div className={styles.emptyState}>No products found in this category.</div>
        ) : (
          <div className={styles.grid}>
            {cards.map((product) => (
              <article key={product.id} className={styles.card}>
                <div className={styles.cardImageWrapper}>
                  {product.primaryImage ? (
                    <Image
                      src={product.primaryImage}
                      alt={product.title}
                      fill
                      className={styles.cardImage}
                      sizes="(max-width: 768px) 100vw, 320px"
                    />
                  ) : null}
                </div>
                <div className={styles.cardBody}>
                  <h3 className={styles.cardTitle}>{product.title}</h3>
                  {product.shortSummary ? (
                    <p className={styles.cardSummary}>{product.shortSummary}</p>
                  ) : null}
                  {product.price ? <div className={styles.cardPrice}>{product.price}</div> : null}
                  <div className={styles.cardFooter}>
                    <Link className={styles.cardLink} href={`/p/${product.slug}`} prefetch>
                      View Details
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )
      ) : (
        <div className={styles.emptyState}>Select a category to view products.</div>
      )}
      {/* Render pagination controls if there are multiple pages */}
      {selectedCategory && totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Pagination">
          <div className={styles.paginationList}>
            {paginationPages.map((pageNumber) => {
              const href = buildPageHref(selectedCategory!.slug, pageNumber);
              const isActive = pageNumber === currentPage;
              const className = isActive
                ? `${styles.pageLink} ${styles.pageLinkActive}`
                : styles.pageLink;
              return (
                <Link
                  key={pageNumber}
                  className={className}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  prefetch
                >
                  {pageNumber}
                </Link>
              );
            })}
          </div>
        </nav>
      ) : null}
    </main>
  );
}