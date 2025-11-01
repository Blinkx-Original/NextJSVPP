import {
  PRODUCT_CATEGORY_ARCHIVE_PAGE_SIZE,
  findProductCategoryArchiveEntry,
  getProductCategoryArchivePage,
  getPublishedProductsForCategory,
  type CategoryProductSummary,
  type ProductCategoryArchiveEntry
} from '@/lib/categories';

export const CATEGORY_ARCHIVE_PAGE_SIZE = PRODUCT_CATEGORY_ARCHIVE_PAGE_SIZE;

export interface ArchiveIndexData {
  entries: ProductCategoryArchiveEntry[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export async function loadArchiveIndex(page: number): Promise<ArchiveIndexData> {
  const pageResult = await getProductCategoryArchivePage(page, CATEGORY_ARCHIVE_PAGE_SIZE);
  return {
    entries: pageResult.entries,
    totalCount: pageResult.totalCount,
    totalPages: pageResult.totalPages,
    currentPage: pageResult.currentPage,
    pageSize: CATEGORY_ARCHIVE_PAGE_SIZE
  };
}

export interface ArchiveCategoryData {
  entry: ProductCategoryArchiveEntry;
  products: CategoryProductSummary[];
  totalCount: number;
  totalPages: number;
  currentPage: number;
  pageSize: number;
}

export async function loadArchiveCategory(
  slug: string,
  page: number,
  requestId?: string
): Promise<ArchiveCategoryData | null> {
  const entry = await findProductCategoryArchiveEntry(slug);
  if (!entry) {
    return null;
  }

  const safePage = Number.isFinite(page) && page > 0 ? Math.trunc(page) : 1;
  const offset = (safePage - 1) * CATEGORY_ARCHIVE_PAGE_SIZE;
  let { products, totalCount } = await getPublishedProductsForCategory(
    { id: BigInt(0), slug: entry.slug, name: entry.name },
    {
      limit: CATEGORY_ARCHIVE_PAGE_SIZE,
      offset,
      orderBy: 'lastUpdated',
      requestId
    }
  );

  const totalPages = Math.max(1, Math.ceil(totalCount / CATEGORY_ARCHIVE_PAGE_SIZE));
  let currentPage = safePage;

  if (currentPage > totalPages && totalCount > 0) {
    currentPage = totalPages;
    const lastOffset = (totalPages - 1) * CATEGORY_ARCHIVE_PAGE_SIZE;
    ({ products } = await getPublishedProductsForCategory(
      { id: BigInt(0), slug: entry.slug, name: entry.name },
      {
        limit: CATEGORY_ARCHIVE_PAGE_SIZE,
        offset: lastOffset,
        orderBy: 'lastUpdated',
        requestId
      }
    ));
  }

  return {
    entry,
    products,
    totalCount,
    totalPages,
    currentPage,
    pageSize: CATEGORY_ARCHIVE_PAGE_SIZE
  };
}
