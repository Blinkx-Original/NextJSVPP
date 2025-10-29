'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { Tree, type NodeRendererProps, type TreeItem } from 'react-arborist';
import styles from './page.module.css';

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

async function fetchCategoryProducts(slug: string, limit: number) {
  const response = await fetch(`/api/categories/${slug}/products?limit=${limit}`, {
    cache: 'no-store'
  });

  if (!response.ok) {
    throw new Error('request_failed');
  }

  const payload = await response.json();

  if (!payload.ok) {
    throw new Error(payload.message || 'request_failed');
  }

  return payload as {
    ok: true;
    category: { slug: string; name: string; type: 'product' | 'blog' };
    totalCount: number;
    products: ExplorerProductCard[];
  };
}

export function CategoryExplorer({
  productCategories,
  blogCategories,
  initialCategory,
  initialProducts,
  initialTotalCount,
  productsPreviewLimit
}: CategoryExplorerProps) {
  const [search, setSearch] = useState('');
  const [selection, setSelection] = useState(() =>
    initialCategory ? [`${initialCategory.type}:${initialCategory.slug}`] : []
  );
  const [selectedCategory, setSelectedCategory] = useState<ExplorerCategory | null>(initialCategory);
  const [fetchState, setFetchState] = useState<FetchState>({
    status: 'idle',
    products: initialProducts,
    totalCount: initialTotalCount
  });
  const [isPending, startTransition] = useTransition();

  const categoriesByNodeId = useMemo(() => {
    const map = new Map<string, ExplorerCategory>();
    for (const category of productCategories) {
      map.set(`product:${category.slug}`, category);
    }
    for (const category of blogCategories) {
      map.set(`blog:${category.slug}`, category);
    }
    return map;
  }, [productCategories, blogCategories]);

  const { data: treeData, hasResults } = useMemo(
    () => buildTreeData(productCategories, blogCategories, search),
    [productCategories, blogCategories, search]
  );

  function handleSelect(ids: Array<string | number>) {
    const id = ids[0];
    if (!id || typeof id !== 'string') {
      return;
    }
    const category = categoriesByNodeId.get(id);
    if (!category) {
      return;
    }

    if (selectedCategory?.slug === category.slug && fetchState.status !== 'error') {
      return;
    }

    setSelection([id]);
    setSelectedCategory(category);

    if (category.type !== 'product') {
      setFetchState({ status: 'idle', products: [], totalCount: 0 });
      return;
    }

    startTransition(() => {
      setFetchState((previous) => ({ ...previous, status: 'loading' }));
      fetchCategoryProducts(category.slug, productsPreviewLimit)
        .then((payload) => {
          setFetchState({ status: 'idle', products: payload.products, totalCount: payload.totalCount });
        })
        .catch(() => {
          setFetchState({ status: 'error', products: [], totalCount: 0, message: 'Unable to load products right now.' });
        });
    });
  }

  const activeProducts = fetchState.products;
  const activeTotal = fetchState.totalCount;
  const isLoading = fetchState.status === 'loading' || isPending;
  const hasActiveProducts = activeProducts.length > 0;

  return (
    <section className={styles.explorer}>
      <div className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <h2 className={styles.sidebarTitle}>Browse the catalog</h2>
          <p className={styles.sidebarSubtitle}>
            Filter categories or jump into a specific collection.
          </p>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search categories"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search categories"
          />
        </div>
        <div className={styles.treeWrapper}>
          {hasResults ? (
            <Tree data={treeData} renderNode={renderTreeNode} selection={selection} onSelect={handleSelect} />
          ) : (
            <div className={styles.emptyTreeState}>No categories match your search.</div>
          )}
        </div>
      </div>

      <div className={styles.detailsPanel}>
        {selectedCategory ? (
          <div className={styles.detailsContent}>
            <header className={styles.detailsHeader}>
              <div>
                <span className={styles.categoryTypeBadge}>
                  {selectedCategory.type === 'product' ? 'Product Category' : 'Blog Category'}
                </span>
                <h2 className={styles.categoryName}>{selectedCategory.name}</h2>
                {selectedCategory.shortDescription ? (
                  <p className={styles.categoryDescription}>{selectedCategory.shortDescription}</p>
                ) : null}
              </div>
              <div className={styles.detailsActions}>
                {selectedCategory.type === 'product' ? (
                  <Link className={styles.primaryButton} href={`/categories/${selectedCategory.slug}`} prefetch>
                    View full category
                  </Link>
                ) : (
                  <Link className={styles.primaryButton} href={`/bc/${selectedCategory.slug}`} prefetch>
                    Explore blog posts
                  </Link>
                )}
              </div>
            </header>

            {selectedCategory.heroImageUrl ? (
              <div className={styles.heroImageWrapper}>
                <Image
                  src={selectedCategory.heroImageUrl}
                  alt={selectedCategory.name}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 480px"
                  className={styles.heroImage}
                />
              </div>
            ) : null}

            {selectedCategory.type === 'product' ? (
              <div className={styles.productsSection}>
                <div className={styles.productsHeader}>
                  <h3>Products in this category</h3>
                  <span>{activeTotal} listed</span>
                </div>
                {isLoading ? (
                  <div className={styles.loadingState}>Loading products…</div>
                ) : fetchState.status === 'error' ? (
                  <div className={styles.errorState}>{fetchState.message}</div>
                ) : hasActiveProducts ? (
                  <div className={styles.productsGrid}>
                    {activeProducts.map((product) => (
                      <article key={product.id} className={styles.productCard}>
                        <div className={styles.productImageWrapper}>
                          {product.primaryImage ? (
                            <Image
                              src={product.primaryImage}
                              alt={product.title}
                              fill
                              sizes="(max-width: 768px) 100vw, 220px"
                              className={styles.productImage}
                            />
                          ) : (
                            <div className={styles.productImagePlaceholder}>No image</div>
                          )}
                        </div>
                        <div className={styles.productBody}>
                          <h4 className={styles.productTitle}>{product.title}</h4>
                          {product.shortSummary ? (
                            <p className={styles.productSummary}>{product.shortSummary}</p>
                          ) : null}
                          <div className={styles.productFooter}>
                            {product.price ? <span className={styles.productPrice}>{product.price}</span> : null}
                            <Link className={styles.secondaryButton} href={`/p/${product.slug}`} prefetch>
                              View product
                            </Link>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyProductsState}>
                    No published products have been linked to this category yet.
                  </div>
                )}
              </div>
            ) : (
              <div className={styles.blogCategoryNote}>
                Browse featured blog posts curated for this topic in the BlinkX blog.
              </div>
            )}
          </div>
        ) : (
          <div className={styles.placeholderState}>
            Select a category to preview its products and details.
          </div>
        )}
      </div>
    </section>
  );
}
