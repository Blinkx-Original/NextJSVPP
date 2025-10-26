import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import styles from './page.module.css';
import { CategoryExplorer, type CategoryFilterType } from './category-explorer';
import {
  getPublishedCategories,
  getPublishedCategoryPickerOptions,
  type CategorySummary,
  type CategoryPickerOption
} from '@/lib/categories';
import { createRequestId } from '@/lib/request-id';
import { buildCategoriesHubUrl } from '@/lib/urls';

export const runtime = 'nodejs';
export const revalidate = 86400;

const PAGE_SIZE = 12;
const PAGE_TITLE = 'Categories | BlinkX Virtual Product Pages';
const PAGE_DESCRIPTION =
  'Browse all product and blog categories on BlinkX — from forklifts to industrial automation and more.';

function parseType(value: string | undefined): CategoryFilterType {
  if (!value) {
    return 'all';
  }
  const normalized = value.toLowerCase();
  if (normalized === 'product' || normalized === 'blog') {
    return normalized;
  }
  return 'all';
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

function toCategoryCards(categories: CategorySummary[]) {
  return categories.map((category) => ({
    id: category.id.toString(),
    type: category.type,
    slug: category.slug,
    name: category.name,
    shortDescription: category.shortDescription,
    heroImageUrl: category.heroImageUrl
  }));
}

function toCategoryPickerOptions(options: CategoryPickerOption[]) {
  return options.map((option) => ({
    type: option.type,
    slug: option.slug,
    name: option.name
  }));
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

interface PageProps {
  searchParams?: { [key: string]: string | string[] | undefined };
}

function resolveSearchParam(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) {
    return value[0];
  }
  return value;
}

export default async function CategoriesPage({ searchParams }: PageProps) {
  const params = searchParams ?? {};
  const type = parseType(resolveSearchParam(params.type));
  const pageParam = parsePage(resolveSearchParam(params.page));
  const offset = (pageParam - 1) * PAGE_SIZE;
  const requestId = createRequestId();

  const filterType = type === 'all' ? undefined : type;
  const [pageResult, pickerOptions] = await Promise.all([
    getPublishedCategories({
      type: filterType,
      limit: PAGE_SIZE,
      offset,
      requestId
    }),
    getPublishedCategoryPickerOptions({ type: filterType, requestId })
  ]);

  let { categories, totalCount } = pageResult;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  if (pageParam > 1 && categories.length === 0 && totalCount > 0) {
    const lastPage = totalPages;
    if (lastPage <= 0) {
      notFound();
    }
    const lastOffset = (lastPage - 1) * PAGE_SIZE;
    ({ categories } = await getPublishedCategories({
      type: filterType,
      limit: PAGE_SIZE,
      offset: lastOffset,
      requestId
    }));
    const cards = toCategoryCards(categories);
    return (
      <main className={styles.page}>
        <section className={styles.hero}>
          <h1 className={styles.heroTitle}>Categories</h1>
          <p className={styles.heroSubtitle}>{PAGE_DESCRIPTION}</p>
        </section>
        <CategoryExplorer
          categories={cards}
          totalCount={totalCount}
          page={lastPage}
          pageSize={PAGE_SIZE}
          activeType={type}
          categoryPickerOptions={toCategoryPickerOptions(pickerOptions)}
        />
      </main>
    );
  }

  const cards = toCategoryCards(categories);
  const picker = toCategoryPickerOptions(pickerOptions);

  return (
    <main className={styles.page}>
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>Categories</h1>
        <p className={styles.heroSubtitle}>{PAGE_DESCRIPTION}</p>
      </section>
      <CategoryExplorer
        categories={cards}
        totalCount={totalCount}
        page={Math.min(pageParam, totalPages)}
        pageSize={PAGE_SIZE}
        activeType={type}
        categoryPickerOptions={picker}
      />
    </main>
  );
}
