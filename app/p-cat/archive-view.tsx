import Link from 'next/link';
import styles from './index.module.css';
import { loadArchiveIndex, CATEGORY_ARCHIVE_PAGE_SIZE } from './archive-data';

const PAGE_SIZE = CATEGORY_ARCHIVE_PAGE_SIZE;

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

function buildIndexHref(page: number): string {
  return page <= 1 ? '/p-cat' : `/p-cat/page/${page}`;
}

function buildDetailHref(slug: string): string {
  return `/p-cat/${slug}`;
}

export async function CategoryArchiveView({ page }: { page: number }) {
  const { entries, totalCount, totalPages, currentPage } = await loadArchiveIndex(page);
  const pageNumbers = buildPageNumbers(totalPages, currentPage);

  return (
    <>
      <section className={styles.hero}>
        <span className={styles.heroBadge}>Catalog index</span>
        <h1 className={styles.heroTitle}>BlinkX Product Category Explorer</h1>
        <p className={styles.heroSubtitle}>
          Every category published in the TiDB-powered products table lives here. Explore the full
          catalog tree, review how many listings each category contains, and drill into a dedicated
          archive that mirrors the WordPress experience.
        </p>
        <div className={styles.heroMeta}>
          <span>
            <strong>{formatNumber(totalCount)}</strong> categories tracked
          </span>
          <span>
            Showing up to <strong>{PAGE_SIZE}</strong> per page
          </span>
        </div>
      </section>

      {entries.length === 0 ? (
        <div className={styles.emptyState}>No product categories are published yet.</div>
      ) : (
        <div className={styles.grid}>
          {entries.map((entry) => {
            const lastUpdated = formatDate(entry.lastUpdatedAt);
            const href = buildDetailHref(entry.slug);
            return (
              <article key={entry.slug} className={styles.card}>
                <div className={styles.cardHeader}>
                  <h2 className={styles.cardTitle}>{entry.name}</h2>
                  <div className={styles.cardMeta}>
                    <span>
                      <strong>{formatNumber(entry.productCount)}</strong> products
                    </span>
                    {lastUpdated ? <span>Updated {lastUpdated}</span> : null}
                  </div>
                </div>
                <div className={styles.cardFooter}>
                  <Link href={href} className={styles.cardButton} prefetch>
                    Go To Category
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Pagination">
          <div className={styles.paginationNav}>
            {currentPage > 1 ? (
              <Link href={buildIndexHref(currentPage - 1)} className={styles.paginationControl} prefetch>
                Prev
              </Link>
            ) : null}
            <div className={styles.pagination}>
              {pageNumbers.map((pageNumber) => {
                const isActive = pageNumber === currentPage;
                const href = buildIndexHref(pageNumber);
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
            </div>
            {currentPage < totalPages ? (
              <Link href={buildIndexHref(currentPage + 1)} className={styles.paginationControl} prefetch>
                Next
              </Link>
            ) : null}
          </div>
        </nav>
      ) : null}
    </>
  );
}
