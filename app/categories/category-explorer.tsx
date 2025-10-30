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

// The category page allows users to browse all published categories.  It
// supports filtering by category type (product vs blog), searching by name
// and description, jumping to a specific category via the tree in the left
// panel, and paginating through the results.  This component is a
// self‑contained client component that receives the list of categories and
// associated metadata from the server.  It does not fetch any data on its
// own – instead it pushes query string changes to the router which cause
// Next.js to revalidate the page on the server.

export type CategoryFilterType = "all" | "product" | "blog";

/**
 * Category groups mirror the underlying category `type` values.  A
 * category is either a product or a blog category.  These strings are
 * lowercased for safe comparison.
 */
type CategoryGroup = "product" | "blog";

/**
 * CategoryCard describes the minimal information required to render a
 * category card in the results grid.  The `id` is always a string to
 * simplify key extraction in React lists.
 */
export interface CategoryCard {
  id: string;
  type: CategoryGroup;
  slug: string;
  name: string;
  shortDescription: string | null;
  heroImageUrl: string | null;
}

/**
 * CategoryPickerOption describes a single item in the tree selector.  The
 * `type` determines the group (product/blog) and the `slug` uniquely
 * identifies the category itself.  The list of picker options is
 * precomputed on the server for consistency.
 */
export interface CategoryPickerOption {
  type: CategoryGroup;
  slug: string;
  name: string;
}

/**
 * Props accepted by the CategoryExplorer.  `categories` is the page of
 * categories to display.  `totalCount` and `pageSize` are used to compute
 * pagination.  `page` and `activeType` come from the URL query string and
 * are passed through unchanged so the component can update them via the
 * router.  `categoryPickerOptions` contains all available categories in
 * the system for building the tree; if empty, the tree falls back to
 * deriving from the current page of categories.
 */
export interface CategoryExplorerProps {
  categories: CategoryCard[];
  totalCount: number;
  page: number;
  pageSize: number;
  activeType: CategoryFilterType;
  categoryPickerOptions: CategoryPickerOption[];
}

/**
 * Labels for each category group used in the tree view.  These strings are
 * intentionally verbose for accessibility and can be adjusted without
 * modifying other parts of the component.
 */
const GROUP_LABELS: Record<CategoryGroup, string> = {
  product: "Product categories",
  blog: "Blog categories"
};

/**
 * Badges shown on each category card to indicate whether it is a product or
 * blog category.  These values should remain short to avoid wrapping.
 */
const GROUP_BADGES: Record<CategoryGroup, string> = {
  product: "Products",
  blog: "Blog"
};

/**
 * Tree node type used by the Arborist tree component.  Each node is either
 * a `group` (top level grouping of categories) or a `category` leaf.  The
 * union is discriminated by the `kind` property.  See the Arborist
 * documentation for details.
 */
type PickerTreeNode =
  | { kind: "group"; group: CategoryGroup; label: string }
  | { kind: "category"; group: CategoryGroup; label: string; slug: string };

/**
 * When building the category tree we first determine which options to use.
 * If the server provided a list of picker options (covering every
 * published category) then those are used.  Otherwise we derive options
 * from the subset of categories on the current page.  This fallback keeps
 * the tree operational even when the list of options is empty.
 */
function derivePickerOptions(
  categories: CategoryCard[],
  provided: CategoryPickerOption[]
): CategoryPickerOption[] {
  return provided.length > 0
    ? provided
    : categories.map((category) => ({
        type: category.type,
        slug: category.slug,
        name: category.name
      }));
}

/**
 * Build the tree data structure consumed by Arborist from an array of
 * picker options.  Each option is grouped by its `type`, sorted
 * alphabetically by name, and wrapped in a node with the required
 * properties.  Groups without any options are omitted from the result.
 */
function buildTreeItems(
  options: CategoryPickerOption[]
): Array<TreeItem<PickerTreeNode>> {
  const grouped: Record<CategoryGroup, CategoryPickerOption[]> = { product: [], blog: [] };
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

/**
 * Filter the list of categories based on a search query.  The query is
 * normalised to lowercase and matched against both the name and the
 * shortDescription (if present).  When the query is empty the original
 * array is returned.
 */
function filterCategories(categories: CategoryCard[], query: string): CategoryCard[] {
  const value = query.trim().toLowerCase();
  if (!value) {
    return categories;
  }
  return categories.filter((category) => {
    const haystack = `${category.name} ${category.shortDescription ?? ""}`.toLowerCase();
    return haystack.includes(value);
  });
}

/**
 * Render an array of category cards for the results grid.  Each card
 * contains an image (if available), a badge indicating the group, and
 * navigates to either `/categories/{slug}` or `/bc/{slug}` depending on
 * whether it is a product or blog category.  The `key` prop uses the
 * category ID to avoid collisions.
 */
function renderCategoryCards(categories: CategoryCard[]): ReactNode {
  return categories.map((category) => {
    const href =
      category.type === "blog" ? `/bc/${category.slug}` : `/categories/${category.slug}`;
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

/**
 * Build pagination buttons for the bottom of the page.  Each page number
 * becomes a button that triggers the `handlePageChange` callback.  The
 * current page is styled differently and disabled while a transition is
 * pending.  When there is only one page the returned element is null.
 */
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

/**
 * The main CategoryExplorer component.  It controls the state of the
 * category tree, search box, type filter and pagination.  It uses the
 * Next.js navigation router to update the query string in response to
 * user actions.  When the user selects a specific category from the tree
 * the router navigates directly to that category's page.  Changes to
 * filters and pagination cause the current page to be revalidated on the
 * server.
 */
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
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [selection, setSelection] = useState<string[]>(() =>
    activeType === "all" ? [] : [`group:${activeType}`]
  );

  // Determine the list of picker options.  If the server provided a
  // complete list this is used, otherwise derive from the current page.
  const pickerOptions = useMemo(
    () => derivePickerOptions(categories, categoryPickerOptions),
    [categories, categoryPickerOptions]
  );

  // Build the tree structure from the picker options.
  const treeItems = useMemo(() => buildTreeItems(pickerOptions), [pickerOptions]);

  // Filter the categories in memory based on the search query.  This does
  // not affect the total count since that comes from the server.
  const filteredCategories = useMemo(
    () => filterCategories(categories, search),
    [categories, search]
  );

  // Compute the total number of pages based on the total count from the
  // server and the fixed page size.
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize]
  );

  // Whenever the activeType changes ensure that the selection reflects the
  // group.  If the user previously selected a leaf node then keep that
  // selection until they change filters.
  useEffect(() => {
    setSelection((current) => {
      if (current.length > 0 && (current[0] as string).startsWith("category:")) {
        return current;
      }
      if (activeType === "all") {
        return [];
      }
      return [`group:${activeType}`];
    });
  }, [activeType]);

  /**
   * Update the URL query string in response to filter or pagination
   * changes.  Keys with an undefined value are removed from the query.
   * The router push is wrapped in a transition to avoid showing a
   * loading state on the current page.
   */
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

  /**
   * Handle changes to the type filter drop down.  Selecting "all" clears
   * the group selection, while selecting a specific type selects that
   * group.  The page number is reset to 1 on type changes.
   */
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

  /**
   * Handle clicking on a page number.  If the user clicks the current
   * page we do nothing.  Otherwise update the page query parameter.  The
   * offset is computed on the server so we only pass the page number.
   */
  const handlePageChange = useCallback(
    (nextPage: number) => {
      if (nextPage === page) {
        return;
      }
      updateQuery({ page: nextPage > 1 ? String(nextPage) : undefined });
    },
    [page, updateQuery]
  );

  // Build the pagination buttons on demand.  If there is only one page
  // nothing is rendered.
  const pagination = useMemo(
    () =>
      totalPages > 1
        ? buildPagination(totalPages, page, handlePageChange, isPending)
        : null,
    [handlePageChange, isPending, page, totalPages]
  );

  /**
   * Render a node in the Arborist tree.  Groups and leaves are styled
   * differently and include a badge for the category type on leaves.
   */
  const renderTreeNode = useCallback(
    ({ node, style }: NodeRendererProps<PickerTreeNode>) => {
      const baseClass =
        node.data.kind === "group"
          ? `${styles.treeNode} ${styles.treeGroup}`
          : `${styles.treeNode} ${styles.treeLeaf}`;
      const className = node.isSelected ? `${baseClass} ${styles.treeNodeActive}` : baseClass;
      return (
        <div style={style} className={className}>
          <span className={styles.treeLabel}>{node.data.label}</span>
          {node.data.kind === "category" ? (
            <span
              className={`${styles.treeBadge} ${
                node.data.group === "product" ? styles.productBadge : styles.blogBadge
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

  /**
   * Handle selection in the tree.  Group selections update the type
   * filter.  Category selections navigate directly to the category page.
   */
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
  const categoryCards = useMemo(() => renderCategoryCards(filteredCategories), [filteredCategories]);

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