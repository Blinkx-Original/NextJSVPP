import type { Metadata } from "next";
import { headers } from "next/headers";
import styles from "./page.module.css";
import { CategoryExplorer, type CategoryCard, type CategoryFilterType } from "./category-explorer";
import {
  getPublishedCategories,
  getPublishedCategoryPickerOptions,
  type CategorySummary
} from "@/lib/categories";
import { createRequestId } from "@/lib/request-id";
import { buildCategoriesHubUrl } from "@/lib/urls";

export const runtime = "nodejs";
// Revalidate the categories hub periodically to refresh the list of
// published categories.  A relatively short interval keeps the hub up to
// date without forcing a rebuild on every request.
export const revalidate = 600;

// The number of categories to display per page.  Adjust this value to
// control the length of each page; it should match the page size used
// when fetching categories from the database.
const PAGE_SIZE = 24;

const PAGE_TITLE = "Browse Categories | BlinkX Virtual Product Pages";
const PAGE_DESCRIPTION =
  "Explore published product and blog categories, discover curated products, and jump directly into the BlinkX catalog.";

/**
 * Resolve a query string value that might be provided as an array or a
 * string.  Next.js serialises duplicate query parameters into an array
 * which we normalise here by taking the first element.
 */
function resolveSearchParam(value: string | string[] | undefined): string | undefined {
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
 * Parse the type filter from the query string.  Only the strings
 * "product" and "blog" are considered valid; any other value falls
 * back to "all".
 */
function parseType(value: string | undefined): CategoryFilterType {
  if (!value) {
    return "all";
  }
  const lower = value.trim().toLowerCase();
  if (lower === "product" || lower === "blog") {
    return lower as CategoryFilterType;
  }
  return "all";
}

/**
 * Convert a CategorySummary (returned from the database) into a
 * CategoryCard consumed by the CategoryExplorer client component.
 */
function toCategoryCard(summary: CategorySummary): CategoryCard {
  return {
    id: summary.id.toString(),
    type: summary.type === "blog" ? "blog" : "product",
    slug: summary.slug,
    name: summary.name,
    shortDescription: summary.shortDescription,
    heroImageUrl: summary.heroImageUrl
  };
}

/**
 * Generate metadata for the categories hub.  The canonical URL is built
 * from the request host and points to the root of the categories hub.
 */
export async function generateMetadata(): Promise<Metadata> {
  const host = headers().get("host") ?? undefined;
  const canonical = buildCategoriesHubUrl(host);
  return {
    title: PAGE_TITLE,
    description: PAGE_DESCRIPTION,
    alternates: { canonical },
    openGraph: {
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION,
      url: canonical
    },
    twitter: {
      card: "summary_large_image",
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION
    }
  };
}

interface PageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

/**
 * The main page of the categories hub.  It reads the current query
 * parameters, fetches the appropriate slice of categories and their total
 * count from the database, and passes them to the client component for
 * rendering.  This function runs on the server and is revalidated based
 * on the `revalidate` export above.
 */
export default async function CategoriesPage({ searchParams }: PageProps) {
  const requestId = createRequestId();
  const pageParam = parsePage(resolveSearchParam(searchParams?.page));
  const activeType = parseType(resolveSearchParam(searchParams?.type));
  const offset = (pageParam - 1) * PAGE_SIZE;

  // Fetch the current page of categories and total count from the
  // database.  When the active type is "all" we do not include a type
  // filter.  Otherwise we request only the selected type.
  const { categories, totalCount } = await getPublishedCategories({
    type: activeType === "all" ? undefined : activeType,
    limit: PAGE_SIZE,
    offset,
    requestId
  });

  // Convert the summaries into the shape expected by the client
  // component.  Always create a new array to avoid mutating the source.
  const cards: CategoryCard[] = categories.map(toCategoryCard);

  // Fetch the full list of picker options once.  Even when filtering by
  // type we still fetch all options so that the tree can show both
  // product and blog groups when available.  This avoids confusing the
  // user when switching filters.
  const pickerOptions = await getPublishedCategoryPickerOptions({ requestId });

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Discover Categories</h1>
        <p className={styles.heroSubtitle}>{PAGE_DESCRIPTION}</p>
      </section>
      <CategoryExplorer
        categories={cards}
        totalCount={totalCount}
        page={pageParam}
        pageSize={PAGE_SIZE}
        activeType={activeType}
        categoryPickerOptions={pickerOptions}
      />
    </main>
  );
}