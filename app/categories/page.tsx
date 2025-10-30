import type { Metadata } from 'next';
import { headers } from 'next/headers';
import styles from './page.module.css';
import {
  CategoryExplorer,
  type ExplorerCategory,
  type ExplorerProductCard
} from './category-explorer';
import {
  getAllPublishedCategories,
  getPublishedProductsForCategory,
  type CategoryProductSummary,
  type CategorySummary
} from '@/lib/categories';
import { createRequestId } from '@/lib/request-id';
import { buildCategoriesHubUrl } from '@/lib/urls';

export const runtime = 'nodejs';
export const revalidate = 600;

const PAGE_TITLE = 'Browse Categories | BlinkX Virtual Product Pages';
const PAGE_DESCRIPTION =
  'Explore published product and blog categories, discover curated products, and jump directly into the BlinkX catalog.';
const PRODUCTS_PREVIEW_LIMIT = 12;

function toExplorerCategory(category: CategorySummary): ExplorerCategory {
  return {
    id: category.id.toString(),
    slug: category.slug,
    name: category.name,
    type: category.type,
    shortDescription: category.shortDescription,
    heroImageUrl: category.heroImageUrl
  };
}

function toExplorerProductCard(product: CategoryProductSummary): ExplorerProductCard {
  return {
    id: product.id.toString(),
    slug: product.slug,
    title: product.title,
    shortSummary: product.shortSummary,
    price: product.price,
    primaryImage: product.primaryImage,
    lastUpdatedAt: product.lastUpdatedAt
  };
}

function chooseInitialCategory(
  productCategories: CategorySummary[],
  blogCategories: CategorySummary[]
): CategorySummary | null {
  if (productCategories.length > 0) {
    return productCategories[0]!;
  }
  if (blogCategories.length > 0) {
    return blogCategories[0]!;
  }
  return null;
}

export async function generateMetadata(): Promise<Metadata> {
  const host = headers().get('host') ?? undefined;
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
      card: 'summary_large_image',
      title: PAGE_TITLE,
      description: PAGE_DESCRIPTION
    }
  };
}

export default async function CategoriesPage() {
  const requestId = createRequestId();
  const categories = await getAllPublishedCategories({ requestId });
  const sorted = categories.slice().sort((a, b) => a.name.localeCompare(b.name));

  const productSummaries = sorted.filter((category) => category.type === 'product');
  const blogSummaries = sorted.filter((category) => category.type === 'blog');

  const initialCategorySummary = chooseInitialCategory(productSummaries, blogSummaries);

  let initialProducts: ExplorerProductCard[] = [];
  let initialTotalCount = 0;

  if (initialCategorySummary && initialCategorySummary.type === 'product') {
    const { products, totalCount } = await getPublishedProductsForCategory(initialCategorySummary, {
      limit: PRODUCTS_PREVIEW_LIMIT,
      offset: 0,
      requestId
    });
    initialProducts = products.map(toExplorerProductCard);
    initialTotalCount = totalCount;
  }

  const productCategories = productSummaries.map(toExplorerCategory);
  const blogCategories = blogSummaries.map(toExplorerCategory);
  const initialCategory = initialCategorySummary ? toExplorerCategory(initialCategorySummary) : null;

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Discover Categories</h1>
        <p className={styles.heroSubtitle}>{PAGE_DESCRIPTION}</p>
      </section>
      <CategoryExplorer
        productCategories={productCategories}
        blogCategories={blogCategories}
        initialCategory={initialCategory}
        initialProducts={initialProducts}
        initialTotalCount={initialTotalCount}
        productsPreviewLimit={PRODUCTS_PREVIEW_LIMIT}
      />
    </main>
  );
}
