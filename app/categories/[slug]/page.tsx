import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import styles from "./page.module.css";
import {
  getPublishedCategoryBySlug,
  getPublishedProductsForCategory,
  type CategoryProductSummary
} from "@/lib/categories";
import { createRequestId } from "@/lib/request-id";
import { buildCategoriesHubUrl } from "@/lib/urls";

// This page is statically generated at runtime using server side data
// fetching.  It renders a list of products associated with a given
// category slug.  If the slug does not correspond to a published
// category then a 404 is returned.  Categories that exist but have no
// products return a 200 with an empty state.

export const runtime = "nodejs";
export const revalidate = 600;

const PAGE_SIZE = 10;

interface PageProps {
  params: { slug: string };
  searchParams?: { [key: string]: string | string[] | undefined };
}

function resolveSearchParam(value: string | string[] | undefined): string | undefined {
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

// Format a slug into a human‑friendly category name.  e.g.
// "latest-category" -> "Latest Category".  This is used for fallback
// metadata only; the actual page will not use it when the category is
// unknown.
function formatSlugName(slug: string): string {
  return slug
    .split("-")
    .filter((part) => part.trim().length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // Generate page metadata based on the category.  If the category does not
  // exist, still return reasonable metadata using the slug as a fallback
  // name.  The page component itself will return a 404 for unknown
  // categories.
  const requestId = createRequestId();
  const category = await getPublishedCategoryBySlug(params.slug, { requestId });
  const host = headers().get("host") ?? undefined;
  const canonical = `${buildCategoriesHubUrl(host)}/${params.slug}`;
  if (!category) {
    const fallbackName = formatSlugName(params.slug);
    const title = `${fallbackName} | Product Category`;
    const description =
      "Discover published products curated for this category on BlinkX Virtual Product Pages.";
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
  const isBlog = category.type === "blog";
  const title = `${category.name} | ${isBlog ? "Blog Category" : "Product Category"}`;
  const description =
    category.shortDescription ||
    (isBlog
      ? "Stories, news, and insights curated for this BlinkX blog category."
      : "Discover published products curated for this category on BlinkX Virtual Product Pages.");
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

function buildPageHref(slug: string, page: number): string {
  if (page <= 1) {
    return `/categories/${slug}`;
  }
  const params = new URLSearchParams({ page: String(page) });
  return `/categories/${slug}?${params.toString()}`;
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const requestId = createRequestId();
  const pageParam = parsePage(resolveSearchParam(searchParams?.page));
  const category = await getPublishedCategoryBySlug(params.slug, { requestId });
  // If the category does not exist at all, return a 404 instead of
  // fabricating a virtual category.  See the categories specification.
  if (!category) {
    notFound();
  }
  // Determine pagination offsets.
  const offset = (pageParam - 1) * PAGE_SIZE;
  let { products, totalCount } = await getPublishedProductsForCategory(
    { id: category!.id, slug: category!.slug, name: category!.name },
    {
      limit: PAGE_SIZE,
      offset,
      requestId
    }
  );
  // Calculate total pages.
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  let currentPage = pageParam;
  // If the requested page is beyond the total pages but there are products,
  // adjust to the last page.
  if (pageParam > totalPages && totalCount > 0) {
    currentPage = totalPages;
    const lastOffset = (totalPages - 1) * PAGE_SIZE;
    ({ products } = await getPublishedProductsForCategory(
      { id: category!.id, slug: category!.slug, name: category!.name },
      {
        limit: PAGE_SIZE,
        offset: lastOffset,
        requestId
      }
    ));
  }
  const cards = toProductCards(products);
  const paginationPages = Array.from({ length: totalPages }, (_, index) => index + 1);
  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>{category!.name}</h1>
        {category!.shortDescription ? (
          <p className={styles.heroDescription}>{category!.shortDescription}</p>
        ) : null}
      </section>
      {/* Render the product cards or an empty state if no products are found */}
      {cards.length === 0 ? (
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
      )}
      {/* Render pagination controls if there are multiple pages */}
      {totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Pagination">
          <div className={styles.paginationList}>
            {paginationPages.map((pageNumber) => {
              const href = buildPageHref(category!.slug, pageNumber);
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