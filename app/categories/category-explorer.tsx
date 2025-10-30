"use client";

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { Tree, type NodeRendererProps, type TreeItem } from 'react-arborist';
import styles from './page.module.css';
import { Tree, type NodeRendererProps, type TreeItem } from 'react-arborist';

export type ExplorerCategory = {
  id: string;
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

type TreeNodeData =
  | { kind: 'group'; label: string }
  | { kind: 'category'; category: ExplorerCategory };

type FetchState =
  | { status: 'idle'; products: ExplorerProductCard[]; totalCount: number }
  | { status: 'loading'; products: ExplorerProductCard[]; totalCount: number }
  | { status: 'error'; products: ExplorerProductCard[]; totalCount: number; message: string };

function buildTreeData(
  productCategories: ExplorerCategory[],
  blogCategories: ExplorerCategory[],
  search: string
): { data: Array<TreeItem<TreeNodeData>>; hasResults: boolean } {
  const normalizedSearch = search.trim().toLowerCase();
  const matchesSearch = (category: ExplorerCategory) => {
    if (!normalizedSearch) {
      return true;
    }
    const haystack = `${category.name} ${category.slug}`.toLowerCase();
    return haystack.includes(normalizedSearch);
  };

  const productNodes = productCategories.filter(matchesSearch).map((category) => ({
    id: `product:${category.slug}`,
    data: { kind: 'category', category } satisfies TreeNodeData
  }));

  const blogNodes = blogCategories.filter(matchesSearch).map((category) => ({
    id: `blog:${category.slug}`,
    data: { kind: 'category', category } satisfies TreeNodeData
  }));

  const data: Array<TreeItem<TreeNodeData>> = [];

  if (productNodes.length > 0) {
    data.push({
      id: 'group:products',
      data: { kind: 'group', label: 'Product Categories' },
      children: productNodes
    });
  }

  if (blogNodes.length > 0) {
    data.push({
      id: 'group:blogs',
      data: { kind: 'group', label: 'Blog Categories' },
      children: blogNodes
    });
  }

  const hasResults = productNodes.length > 0 || blogNodes.length > 0;
  return { data, hasResults };
}

function renderTreeNode({ node, style }: NodeRendererProps<TreeNodeData>) {
  const { data } = node;
  if (data.kind === 'group') {
    return (
      <div className={styles.treeGroup} style={style} role="presentation">
        {data.label}
      </div>
    );
  }

  const className = node.isSelected
    ? `${styles.treeNode} ${styles.treeNodeSelected}`
    : styles.treeNode;

  return (
    <div className={className} style={style}>
      <span className={styles.treeNodeName}>{data.category.name}</span>
      <span className={styles.treeNodeMeta}>{data.category.type === 'product' ? 'Products' : 'Blog'}</span>
    </div>
  );
}

type CategoryGroup = 'product' | 'blog';

type PickerTreeNode =
  | { kind: 'group'; type: CategoryGroup; label: string }
  | { kind: 'category'; type: CategoryGroup; label: string; slug: string };

function typeToBadge(type: 'product' | 'blog'): string {
  return type === 'product' ? 'Product' : 'Blog';
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
  const [search, setSearch] = React.useState('');
  const [isPending, startTransition] = React.useTransition();
  const [treeSelection, setTreeSelection] = React.useState<string[]>(() =>
    activeType === 'all' ? [] : [`group:${activeType}`]
  );

  const pickerSource = useMemo(() => {
    if (categoryPickerOptions.length > 0) {
      return categoryPickerOptions;
    }
    return categories.map((category) => ({
      type: category.type,
      slug: category.slug,
      name: category.name
    }));
  }, [categories, categoryPickerOptions]);

  const pickerSource = React.useMemo(() => {
    if (categoryPickerOptions.length > 0) {
      return categoryPickerOptions;
    }
    return categories.map((category) => ({
      type: category.type,
      slug: category.slug,
      name: category.name
    }));
  }, [categories, categoryPickerOptions]);

  const treeData = React.useMemo(() => {
    const groups: Record<CategoryGroup, CategoryPickerOption[]> = {
      product: [],
      blog: []
    };

    pickerSource.forEach((option) => {
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
  }, [pickerSource]);

  React.useEffect(() => {
    setTreeSelection((current) => {
      if (current.length > 0 && current[0]?.startsWith('category:')) {
        return current;
      }
      if (activeType === 'all') {
        return [];
      }
      return [`group:${activeType}`];
    });
  }, [activeType]);

  const filteredCategories = React.useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return categories;
    }
    return categories.filter((category) => {
      const haystack = `${category.name} ${category.shortDescription ?? ''}`.toLowerCase();
      return haystack.includes(query);
    });
  }, [categories, search]);

  const categoryCards = React.useMemo(() =>
    filteredCategories.map((category) => {
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
    }),
    [filteredCategories]
  );

  const updateQuery = React.useCallback(
    (next: Record<string, string | undefined>) => {
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
    },
    [pathname, router, searchParams, startTransition]
  );

  const handleTypeChange = React.useCallback(
    (event: React.ChangeEvent<HTMLSelectElement>) => {
      const value = event.target.value as CategoryFilterType;
      if (value === 'all') {
        setTreeSelection([]);
      } else {
        setTreeSelection([`group:${value}`]);
      }
      updateQuery({ type: value === 'all' ? undefined : value, page: '1' });
    },
    [updateQuery]
  );

  const handlePageChange = React.useCallback(
    (nextPage: number) => {
      if (nextPage === page) {
        return;
      }
      updateQuery({ page: nextPage > 1 ? String(nextPage) : undefined });
    },
    [page, updateQuery]
  );

  const paginationButtons = React.useMemo(
    () =>
      Array.from({ length: totalPages }, (_, index) => {
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
      }),
    [handlePageChange, isPending, page, totalPages]
  );

  const renderTreeNode = React.useCallback(
    ({ node, style }: NodeRendererProps<PickerTreeNode>) => {
      const baseClassName =
        node.data.kind === 'group'
          ? `${styles.treeNode} ${styles.treeGroup}`
          : `${styles.treeNode} ${styles.treeLeaf}`;
      const className = node.isSelected
        ? `${baseClassName} ${styles.treeNodeActive}`
        : baseClassName;

      return (
        <div style={style} className={className}>
          <span className={styles.treeLabel}>{node.data.label}</span>
          {node.data.kind === 'category' ? (
            <span
              className={`${styles.treeBadge} ${
                node.data.type === 'product' ? styles.productBadge : styles.blogBadge
              }`}
            >
              {node.data.type === 'product' ? 'Products' : 'Blog'}
            </span>
          ) : null}
        </div>
      );
    },
    []
  );

  function handleTreeSelect(ids: Array<string | number>) {
    const [id] = ids;
    if (!id || typeof id !== 'string') {
      return;
    }

    if (id.startsWith('group:')) {
      const [, type] = id.split(':');
      if (type === 'product' || type === 'blog') {
        setTreeSelection([id]);
        updateQuery({ type, page: '1' });
      } else {
        setTreeSelection([]);
        updateQuery({ type: undefined, page: '1' });
      }
      return;
    }

    if (id.startsWith('category:')) {
      const [, type, slug] = id.split(':');
      if (!type || !slug) {
        return;
      }
      setTreeSelection([id]);
      const href = type === 'blog' ? `/bc/${slug}` : `/categories/${slug}`;
      startTransition(() => {
        router.push(href);
      });
    }
  }

  const activeProducts = fetchState.products;
  const activeTotal = fetchState.totalCount;
  const isLoading = fetchState.status === 'loading' || isPending;
  const hasActiveProducts = activeProducts.length > 0;

  return (
    <div className={styles.layout}>
      <aside className={styles.treePanel} aria-label="Browse categories">
        <div className={styles.treeHeader}>
          <h2 className={styles.treeTitle}>Browse the catalog</h2>
          <p className={styles.treeDescription}>
            Pick a category from the list to open its dedicated page.
          </p>
        </div>
        {treeData.length > 0 ? (
          <div className={styles.treeContainer}>
            <Tree
              data={treeData}
              selection={treeSelection}
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
          <div className={styles.grid}>
            {categoryCards}
          </div>
        )}

        {totalPages > 1 ? (
          <nav className={styles.pagination} aria-label="Pagination">
            <div className={styles.paginationList}>
              {paginationButtons}
            </div>
          </nav>
        ) : null}
      </section>
    </div>
  );
}

