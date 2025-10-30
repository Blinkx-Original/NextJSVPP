"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ChangeEvent,
  type ReactNode
} from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Tree as ArboristTree,
  type NodeRendererProps,
  type TreeItem
} from "@/lib/react-arborist";
import styles from "./page.module.css";

export type CategoryFilterType = "all" | "product" | "blog";

type CategoryGroup = "product" | "blog";

type PickerTreeNode =
  | { kind: "group"; group: CategoryGroup; label: string }
  | { kind: "category"; group: CategoryGroup; label: string; slug: string };

export interface CategoryCard {
  id: string;
  type: CategoryGroup;
  slug: string;
  name: string;
  type: 'product' | 'blog';
  shortDescription: string | null;
  heroImageUrl: string | null;
};

export type ExplorerProductCard = {
  id: string;
  slug: string;
  title: string;
  shortSummary: string | null;
  price: string | null;
  primaryImage: string | null;
  lastUpdatedAt: string | null;
};

interface CategoryExplorerProps {
  productCategories: ExplorerCategory[];
  blogCategories: ExplorerCategory[];
  initialCategory: ExplorerCategory | null;
  initialProducts: ExplorerProductCard[];
  initialTotalCount: number;
  productsPreviewLimit: number;
}

export interface CategoryPickerOption {
  type: 'product' | 'blog';
  slug: string;
  name: string;
}

export interface CategoryPickerOption {
  type: CategoryGroup;
  slug: string;
  name: string;
}

export interface CategoryExplorerProps {
  categories: CategoryCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  activeType: CategoryFilterType;
  categoryPickerOptions: CategoryPickerOption[];
}

const GROUP_LABELS: Record<CategoryGroup, string> = {
  product: "Product categories",
  blog: "Blog categories"
};

const GROUP_BADGES: Record<CategoryGroup, string> = {
  product: "Products",
  blog: "Blog"
};

function derivePickerOptions(
  categories: CategoryCard[],
  provided: CategoryPickerOption[]
): CategoryPickerOption[] {
  if (provided.length > 0) {
    return provided;
  }

  return categories.map((category) => ({
    type: category.type,
    slug: category.slug,
    name: category.name
  }));
}

function buildTreeItems(
  options: CategoryPickerOption[]
): Array<TreeItem<PickerTreeNode>> {
  const grouped: Record<CategoryGroup, CategoryPickerOption[]> = {
    product: [],
    blog: []
  };

  options.forEach((option) => {
    grouped[option.type].push(option);
  });

  const items: Array<TreeItem<PickerTreeNode>> = [];

  (Object.keys(grouped) as CategoryGroup[]).forEach((group) => {
    if (grouped[group].length === 0) {
      return;
    }

    const children = grouped[group]
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((option) => ({
        id: `category:${group}:${option.slug}`,
        data: {
          kind: "category" as const,
          group,
          label: option.name,
          slug: option.slug
        }
      }));

    items.push({
      id: `group:${group}`,
      data: {
        kind: "group" as const,
        group,
        label: GROUP_LABELS[group]
      },
      children
    });
  });

  return items;
}

function filterCategories(
  categories: CategoryCard[],
  query: string
): CategoryCard[] {
  const value = query.trim().toLowerCase();
  if (!value) {
    return categories;
  }

  return categories.filter((category) => {
    const haystack = `${category.name} ${category.shortDescription ?? ""}`.toLowerCase();
    return haystack.includes(value);
  });
}

function renderCategoryCards(categories: CategoryCard[]): ReactNode {
  return categories.map((category) => {
    const href =
      category.type === "blog"
        ? `/bc/${category.slug}`
        : `/categories/${category.slug}`;

    return (
      <article key={category.id} className={styles.card}>
        <div className={styles.cardImageWrapper}>
          {category.heroImageUrl ? (
            <Image
              src={category.heroImageUrl}
              alt={category.name}
              fill
              sizes="(max-width: 768px) 100vw, 320px"
              className={styles.cardImage}
            />
          ) : null}
        </div>
        <div className={styles.cardBody}>
          <span className={styles.cardBadge}>{GROUP_BADGES[category.type]}</span>
          <h3 className={styles.cardTitle}>{category.name}</h3>
          {category.shortDescription ? (
            <p className={styles.cardDescription}>{category.shortDescription}</p>
          ) : null}
          <div className={styles.cardFooter}>
            <Link href={href} prefetch className={styles.cardLink}>
              View Details
            </Link>
          </div>
        </div>
      </article>
    );
  });
}

function buildPagination(
  totalPages: number,
  currentPage: number,
  handlePageChange: (page: number) => void,
  isPending: boolean
): ReactNode {
  return Array.from({ length: totalPages }, (_, index) => {
    const target = index + 1;
    const isActive = target === currentPage;
    const className = isActive
      ? `${styles.pageButton} ${styles.pageButtonActive}`
      : styles.pageButton;

    return (
      <button
        key={target}
        type="button"
        className={className}
        onClick={() => handlePageChange(target)}
        aria-current={isActive ? "page" : undefined}
        disabled={isPending && isActive}
      >
        {target}
      </button>
    );
  });
}

function derivePickerOptions(
  categories: CategoryCard[],
  provided: CategoryPickerOption[]
): CategoryPickerOption[] {
  if (provided.length > 0) {
    return provided;
  }
  return categories.map((category) => ({
    type: category.type,
    slug: category.slug,
    name: category.name
  }));
}

function buildTreeData(
  options: CategoryPickerOption[]
): Array<TreeItem<PickerTreeNode>> {
  const groups: Record<CategoryGroup, CategoryPickerOption[]> = {
    product: [],
    blog: []
  };

  options.forEach((option) => {
    groups[option.type].push(option);
  });

  const rootLabels: Record<CategoryGroup, string> = {
    product: 'Product categories',
    blog: 'Blog categories'
  };

  const items: Array<TreeItem<PickerTreeNode>> = [];

  (['product', 'blog'] as const).forEach((type) => {
    if (groups[type].length === 0) {
      return;
    }

    const children = groups[type]
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((option) => ({
        id: `category:${type}:${option.slug}`,
        data: {
          kind: 'category' as const,
          type,
          label: option.name,
          slug: option.slug
        }
      }));

    items.push({
      id: `group:${type}`,
      data: { kind: 'group', type, label: rootLabels[type] },
      children
    });
  });

  return items;
}

function filterCategories(
  categories: CategoryCard[],
  search: string
): CategoryCard[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return categories;
  }
  return categories.filter((category) => {
    const haystack = `${category.name} ${category.shortDescription ?? ''}`.toLowerCase();
    return haystack.includes(query);
  });
}

function buildCategoryCards(categories: CategoryCard[]): ReactNode[] {
  return categories.map((category) => {
    const href =
      category.type === 'product'
        ? `/categories/${category.slug}`
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
  });
}

function buildPaginationButtons(
  totalPages: number,
  currentPage: number,
  handlePageChange: (page: number) => void,
  isPending: boolean
): ReactNode[] {
  return Array.from({ length: totalPages }, (_, index) => {
    const pageNumber = index + 1;
    const isActive = pageNumber === currentPage;
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
  });
}

export function CategoryExplorer({
  productCategories,
  blogCategories,
  initialCategory,
  initialProducts,
  initialTotalCount,
  productsPreviewLimit
}: CategoryExplorerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [selection, setSelection] = useState<string[]>(() =>
    activeType === "all" ? [] : [`group:${activeType}`]
  );

  const pickerOptions = useMemo(
    () => derivePickerOptions(categories, categoryPickerOptions),
    [categories, categoryPickerOptions]
  );

  const treeItems = useMemo(() => buildTreeItems(pickerOptions), [pickerOptions]);

  const filteredCategories = useMemo(
    () => filterCategories(categories, search),
    [categories, search]
  );

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [pageSize, totalCount]
  );

  useEffect(() => {
    setSelection((current) => {
      if (current.length > 0 && current[0]?.startsWith("category:")) {
        return current;
      }

      if (activeType === "all") {
        return [];
      }

      return [`group:${activeType}`];
    });
  }, [activeType]);

  const updateQuery = useCallback(
    (next: Record<string, string | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      Object.entries(next).forEach(([key, value]) => {
        if (!value) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });

      const queryString = params.toString();
      startTransition(() => {
        router.push(queryString ? `${pathname}?${queryString}` : pathname);
      });
    },
    [pathname, router, searchParams, startTransition]
  );

  const handleTypeChange = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as CategoryFilterType;
      if (value === "all") {
        setSelection([]);
      } else {
        setSelection([`group:${value}`]);
      }
      updateQuery({ type: value === "all" ? undefined : value, page: "1" });
    },
    [updateQuery]
  );

  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage === page) {
        return;
      }
      updateQuery({ page: nextPage > 1 ? String(nextPage) : undefined });
    },
    [page, updateQuery]
  );

  const pagination = useMemo(
    () =>
      totalPages > 1
        ? buildPagination(totalPages, page, handlePageChange, isPending)
        : null,
    [handlePageChange, isPending, page, totalPages]
  );

  const renderTreeNode = useCallback(
    ({ node, style }: NodeRendererProps<PickerTreeNode>) => {
      const baseClass =
        node.data.kind === "group"
          ? `${styles.treeNode} ${styles.treeGroup}`
          : `${styles.treeNode} ${styles.treeLeaf}`;

      const className = node.isSelected
        ? `${baseClass} ${styles.treeNodeActive}`
        : baseClass;

      return (
        <div style={style} className={className}>
          <span className={styles.treeLabel}>{node.data.label}</span>
          {node.data.kind === "category" ? (
            <span
              className={`${styles.treeBadge} ${
                node.data.group === "product"
                  ? styles.productBadge
                  : styles.blogBadge
              }`}
            >
              {GROUP_BADGES[node.data.group]}
            </span>
          ) : null}
        </div>
      );
    },
    []
  );

  const handleTreeSelect = useCallback(
    (ids: Array<string | number>) => {
      const [id] = ids;
      if (!id || typeof id !== "string") {
        return;
      }

      if (id.startsWith("group:")) {
        const [, group] = id.split(":");
        if (group === "product" || group === "blog") {
          setSelection([id]);
          updateQuery({ type: group, page: "1" });
        } else {
          setSelection([]);
          updateQuery({ type: undefined, page: "1" });
        }
        return;
      }

      if (id.startsWith("category:")) {
        const [, group, slug] = id.split(":");
        if (!group || !slug) {
          return;
        }

        setSelection([id]);
        const href = group === "blog" ? `/bc/${slug}` : `/categories/${slug}`;
        startTransition(() => {
          router.push(href);
        });
      }
    },
    [router, startTransition, updateQuery]
  );

  const resultsText = `${filteredCategories.length} of ${totalCount} categories`;
  const categoryCards = useMemo(
    () => renderCategoryCards(filteredCategories),
    [filteredCategories]
  );

  return (
    <div className={styles.layout}>
      <aside className={styles.treePanel} aria-label="Browse categories">
        <div className={styles.treeHeader}>
          <h2 className={styles.treeTitle}>Browse the catalog</h2>
          <p className={styles.treeDescription}>
            Pick a category from the list to open its dedicated page.
          </p>
        </div>
        {treeItems.length > 0 ? (
          <div className={styles.treeContainer}>
            <ArboristTree
              data={treeItems}
              selection={selection}
              onSelect={handleTreeSelect}
              renderNode={renderTreeNode}
            />
          </div>
        ) : (
          <p className={styles.treeEmpty}>No categories are available yet.</p>
        )}
      </aside>
      <section className={styles.resultsPanel} aria-live="polite">
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
          <div className={styles.grid}>{categoryCards}</div>
        )}

        {pagination ? (
          <nav className={styles.pagination} aria-label="Pagination">
            <div className={styles.paginationList}>{pagination}</div>
          </nav>
        ) : null}
      </section>
    </div>
  );
}
