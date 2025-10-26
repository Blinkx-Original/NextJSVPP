'use client';

import { useMemo, useState, useTransition, type ChangeEvent } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import styles from './page.module.css';

export type CategoryFilterType = 'all' | 'product' | 'blog';

export interface CategoryCard {
  id: string;
  type: 'product' | 'blog';
  slug: string;
  name: string;
  shortDescription: string | null;
  heroImageUrl: string | null;
}

export interface CategoryExplorerProps {
  categories: CategoryCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  activeType: CategoryFilterType;
  categoryPickerOptions: CategoryPickerOption[];
}

export interface CategoryPickerOption {
  type: 'product' | 'blog';
  slug: string;
  name: string;
}

function typeToBadge(type: 'product' | 'blog'): string {
  return type === 'product' ? 'Product' : 'Blog';
}

export function CategoryExplorer({
  categories,
  totalCount,
  page,
  pageSize,
  activeType,
  categoryPickerOptions
}: CategoryExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState('');
  const [categorySelectValue, setCategorySelectValue] = useState('');
  const [isPending, startTransition] = useTransition();

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  const categorySelectOptions = useMemo(
    () =>
      categoryPickerOptions.map((option) => ({
        value: `${option.type}:${option.slug}`,
        label: option.name
      })),
    [categoryPickerOptions]
  );

  const filteredCategories = useMemo(() => {
    if (!search.trim()) {
      return categories;
    }
    const value = search.trim().toLowerCase();
    return categories.filter((category) => {
      const haystack = [category.name, category.shortDescription || '']
        .join(' ')
        .toLowerCase();
      return haystack.includes(value);
    });
  }, [categories, search]);

  function updateQuery(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(next).forEach(([key, value]) => {
      if (!value) {
        params.delete(key);
      } else {
        params.set(key, value);
      }
    });
    const query = params.toString();
    startTransition(() => {
      router.push(query ? `${pathname}?${query}` : pathname);
    });
  }

  function handleTypeChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value as CategoryFilterType;
    updateQuery({ type: value === 'all' ? undefined : value, page: '1' });
  }

  function handlePageChange(nextPage: number) {
    if (nextPage === page) {
      return;
    }
    updateQuery({ page: nextPage > 1 ? String(nextPage) : undefined });
  }

  function handleCategorySelectChange(event: ChangeEvent<HTMLSelectElement>) {
    const value = event.target.value;
    if (!value) {
      setCategorySelectValue('');
      return;
    }

    setCategorySelectValue(value);
    const [type, slug] = value.split(':');
    const href = type === 'blog' ? `/bc/${slug}` : `/c/${slug}`;

    startTransition(() => {
      router.push(href);
    });

    setCategorySelectValue('');
  }

  const resultsText = `${filteredCategories.length} of ${totalCount} categories`;

  return (
    <div>
      <div className={styles.controls}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel} htmlFor="category-type">
            Category Type
          </label>
          <select
            id="category-type"
            className={styles.select}
            value={activeType}
            onChange={handleTypeChange}
            aria-label="Filter categories by type"
          >
            <option value="all">All</option>
            <option value="product">Products</option>
            <option value="blog">Blogs</option>
          </select>
        </div>
        <div className={styles.searchGroup}>
          {categorySelectOptions.length > 0 ? (
            <select
              id="category-jump"
              className={`${styles.select} ${styles.categorySelect}`}
              value={categorySelectValue}
              onChange={handleCategorySelectChange}
              aria-label="Jump to a category"
            >
              <option value="">Browse categories</option>
              {categorySelectOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search categories"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search categories"
          />
        </div>
      </div>

      <p className={styles.resultsMeta}>{resultsText}</p>

      {filteredCategories.length === 0 ? (
        <div className={styles.emptyState}>No categories match your search.</div>
      ) : (
        <div className={styles.grid}>
          {filteredCategories.map((category) => {
            const href =
              category.type === 'product'
                ? `/c/${category.slug}`
                : `/bc/${category.slug}`;
            return (
              <article key={category.id} className={styles.card}>
                <div className={styles.cardImageWrapper}>
                  {category.heroImageUrl ? (
                    <Image
                      src={category.heroImageUrl}
                      alt={category.name}
                      fill
                      className={styles.cardImage}
                      sizes="(max-width: 768px) 100vw, 320px"
                    />
                  ) : null}
                </div>
                <div className={styles.cardBody}>
                  <span className={styles.cardBadge}>{typeToBadge(category.type)}</span>
                  <h3 className={styles.cardTitle}>{category.name}</h3>
                  {category.shortDescription ? (
                    <p className={styles.cardDescription}>{category.shortDescription}</p>
                  ) : null}
                  <div className={styles.cardFooter}>
                    <Link className={styles.cardLink} href={href} prefetch>
                      View Details
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {totalPages > 1 ? (
        <nav className={styles.pagination} aria-label="Pagination">
          <div className={styles.paginationList}>
            {Array.from({ length: totalPages }, (_, index) => {
              const pageNumber = index + 1;
              const isActive = pageNumber === page;
              const className = isActive
                ? `${styles.pageButton} ${styles.pageButtonActive}`
                : styles.pageButton;
              return (
                <button
                  key={pageNumber}
                  type="button"
                  className={className}
                  onClick={() => handlePageChange(pageNumber)}
                  aria-current={isActive ? 'page' : undefined}
                  disabled={isPending && isActive}
                >
                  {pageNumber}
                </button>
              );
            })}
          </div>
        </nav>
      ) : null}
    </div>
  );
}
