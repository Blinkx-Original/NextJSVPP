import Image from 'next/image';
import Link from 'next/link';
import styles from './detail.module.css';
import type { ArchiveCategoryData } from './archive-data';

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function formatDate(value: string | null): string | null {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function buildPageNumbers(totalPages: number, currentPage: number): number[] {
  const maxVisible = 7;
  if (totalPages <= maxVisible) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const pages = new Set<number>([1, totalPages, currentPage]);
  for (let offset = 1; offset <= 2; offset += 1) {
    pages.add(currentPage - offset);
    pages.add(currentPage + offset);
  }
  return Array.from(pages)
    .filter((page) => page >= 1 && page <= totalPages)
    .sort((a, b) => a - b);
}

function buildCategoryHref(slug: string, page: number): string {
  return page <= 1 ? `/p-cat/${slug}` : `/p-cat/${slug}/page/${page}`;
}

function truncateSummary(summary: string | null, maxLength = 200): string | null {
  if (!summary) {
    return null;
  }
  if (summary.length <= maxLength) {
    return summary;
  }
  const truncated = summary.slice(0, maxLength);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 32) {
    return `${truncated.slice(0, lastSpace).trimEnd()}…`;
  }
  return `${truncated.trimEnd()}…`;
}

function buildMetaLine(brand: string | null, model: string | null): string | null {
  const parts = [brand?.trim(), model?.trim()].filter((part) => part && part.length > 0) as string[];
  if (parts.length === 0) {
    return null;
  }
  return parts.join(' • ');
}

export function CategoryArchiveDetail({ data }: { data: ArchiveCategoryData }) {
  const { entry, products, totalCount, currentPage, totalPages } = data;
  const heroUpdated = formatDate(entry.lastUpdatedAt);
  const pageNumbers = buildPageNumbers(totalPages, currentPage);

  return (
    <>
      <section className={styles.hero}>
        <span className={styles.heroBadge}>Product category</span>
        <h1 className={styles.heroTitle}>{entry.name}</h1>
        <div className={styles.heroStats}>
          <span>
            <strong>{formatNumber(totalCount)}</strong> items
          </span>
          <span>
            Page <strong>{currentPage}</strong> of <strong>{formatNumber(totalPages)}</strong>
          </span>
          {heroUpdated ? <span>Last update {heroUpdated}</span> : null}
        </div>
        <p className={styles.heroDescription}>
          Dive into the BlinkX Virtual Product Pages listings curated for the {entry.name} catalog.
          Each card highlights the key product metadata synchronized from TiDB.
        </p>
      </section>

      {products.length === 0 ? (
        <div className={styles.emptyState}>No products in this category yet.</div>
      ) : (
        <div className={styles.cards}>
          {products.map((product) => {
            const metaLine = buildMetaLine(product.brand, product.model);
            const summary = truncateSummary(product.shortSummary);
            const updated = formatDate(product.lastUpdatedAt);
            return (
              <article key={product.id.toString()} className={styles.card}>
                <div className={styles.cardImageWrapper}>
                  {product.primaryImage ? (
                    <Image
                      src={product.primaryImage}
                      alt={product.title}
                      fill
                      className={styles.cardImage}
                      sizes="(max-width: 900px) 100vw, 320px"
                    />
                  ) : null}
                </div>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>{product.title}</h2>
                  {metaLine ? <div className={styles.cardMeta}>{metaLine}</div> : null}
                </div>
                {summary ? <p className={styles.cardSummary}>{summary}</p> : null}
                <div className={styles.cardFooter}>
                  {updated ? (
                    <span className={styles.cardUpdatedAt}>Updated {updated}</span>
                  ) : (
                    <span className={styles.cardUpdatedAt} aria-hidden="true" />
                  )}
                  <Link href={`/p/${product.slug}`} className={styles.cardButton} prefetch>
                    Go To Product
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <div className={styles.pagination}>
          <div className={styles.paginationMeta}>
            Page {currentPage} of {formatNumber(totalPages)}
          </div>
          <div className={styles.paginationControls}>
            {currentPage > 1 ? (
              <Link
                href={buildCategoryHref(entry.slug, currentPage - 1)}
                className={styles.paginationControl}
                prefetch
              >
                Prev
              </Link>
            ) : null}
            {pageNumbers.map((pageNumber) => {
              const isActive = pageNumber === currentPage;
              const href = buildCategoryHref(entry.slug, pageNumber);
              const className = isActive
                ? `${styles.pageLink} ${styles.pageLinkActive}`
                : styles.pageLink;
              return (
                <Link
                  key={pageNumber}
                  href={href}
                  className={className}
                  aria-current={isActive ? 'page' : undefined}
                  prefetch
                >
                  {pageNumber}
                </Link>
              );
            })}
            {currentPage < totalPages ? (
              <Link
                href={buildCategoryHref(entry.slug, currentPage + 1)}
                className={styles.paginationControl}
                prefetch
              >
                Next
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
