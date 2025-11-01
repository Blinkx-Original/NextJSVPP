import { slugifyCategoryName } from '@/lib/category-slug';
import {
  createVirtualProductCategoryFromSlug,
  getPublishedCategoryBySlug,
  getPublishedProductsForCategory,
  resolveProductCategoryBySlugOrName,
  type CategoryProductSummary
} from '@/lib/categories';
import { getPublishedProductsBySlugs, type NormalizedProductResult } from '@/lib/products';

export const PAGE_SIZE = 10;

export interface ProductCard {
  id: string;
  slug: string;
  title: string;
  shortSummary: string | null;
  price: string | null;
  primaryImage: string | null;
}

export interface ProductListingRenderData {
  key: string;
  heading: string;
  subtitle?: string;
  cards: ProductCard[];
  viewAllHref?: string;
  pagination?: {
    pageKey: string;
    currentPage: number;
    totalPages: number;
  };
}

export type ProductListingType = 'category' | 'manual';

export interface ProductListingConfig {
  type: ProductListingType;
  slug: string | null;
  categoryLabel: string | null;
}

export interface ProductListingPlaceholder {
  config: ProductListingConfig;
  marker: string;
}

export interface ProductListingRequest {
  config: ProductListingConfig;
  pageKey: string;
}

const MANUAL_LISTING_KEYWORDS = new Set([
  'manual',
  'products',
  'productslugs',
  'product_slugs',
  'manualproducts',
  'manual-listing',
  'manualproductslisting',
  'productlistingmanual',
  'productos',
  'lista-manual'
]);

function toCategoryProductCards(products: CategoryProductSummary[]): ProductCard[] {
  return products.map((product) => ({
    id: product.id.toString(),
    slug: product.slug,
    title: product.title,
    shortSummary: product.shortSummary,
    price: product.price,
    primaryImage: product.primaryImage
  }));
}

function normalizeId(value: unknown, fallback: string): string {
  if (typeof value === 'bigint') {
    return value.toString(10);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value).toString(10);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
}

function toManualProductCards(results: NormalizedProductResult[]): ProductCard[] {
  return results
    .map((result) => {
      const slug = result.normalized.slug;
      if (!slug) {
        return null;
      }
      const id = normalizeId((result.raw as { id?: unknown })?.id, slug);
      const images = Array.isArray(result.normalized.images) ? result.normalized.images : [];
      const primaryImage = images.length > 0 ? images[0]! : null;
      const title = result.normalized.title_h1 || slug;
      const shortSummary = result.normalized.short_summary || null;
      const price = result.normalized.price || null;
      return {
        id,
        slug,
        title,
        shortSummary,
        price,
        primaryImage
      } satisfies ProductCard;
    })
    .filter((card): card is ProductCard => card !== null);
}

export function toProductListingSlug(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const slug = slugifyCategoryName(trimmed);
  return slug ? slug : null;
}

function convertIndicatorSyntax(html: string): string {
  const toComment = (descriptor?: string) => {
    const normalizedDescriptor = typeof descriptor === 'string' ? descriptor.trim() : '';
    return `<!-- product-listing${normalizedDescriptor ? ` ${normalizedDescriptor}` : ''} -->`;
  };

  return html
    .replace(/\[\[\s*product[\s_-]*listing(?:\s*(?::|=|\s+)\s*([^\]]+))?\s*\]\]/gi, (_, descriptor) =>
      toComment(descriptor)
    )
    .replace(/\{\{\s*product[\s_-]*listing(?:\s*(?::|=|\s+)\s*([^}]+))?\s*\}\}/gi, (_, descriptor) =>
      toComment(descriptor)
    )
    .replace(/%%\s*product[\s_-]*listing(?:\s*(?::|=|\s+)([^%]+))?%%/gi, (_, descriptor) =>
      toComment(descriptor)
    )
    .replace(/\[\s*product[\s_-]*listing(?:\s*(?::|=|\s+)\s*([^\]]+))?\s*\]/gi, (_, descriptor) =>
      toComment(descriptor)
    );
}

function normalizeLabel(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.replace(/-->/g, '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function parseProductListingConfig(details: string | null | undefined): ProductListingConfig {
  const defaultConfig: ProductListingConfig = { type: 'category', slug: null, categoryLabel: null };
  if (!details) {
    return defaultConfig;
  }

  const trimmed = details.replace(/-->/g, '').trim();
  if (!trimmed) {
    return defaultConfig;
  }

  const collapsed = trimmed.replace(/\s+/g, '').toLowerCase();
  if (MANUAL_LISTING_KEYWORDS.has(collapsed)) {
    return { type: 'manual', slug: null, categoryLabel: null };
  }

  const manualAttrMatch = trimmed.match(/(?:type|source|mode)\s*(?::|=)\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i);
  if (manualAttrMatch) {
    const candidate = (manualAttrMatch[1] ?? manualAttrMatch[2] ?? manualAttrMatch[3] ?? '')
      .replace(/\s+/g, '')
      .toLowerCase();
    if (MANUAL_LISTING_KEYWORDS.has(candidate)) {
      return { type: 'manual', slug: null, categoryLabel: null };
    }
  }

  const slugAttrMatch = trimmed.match(
    /(?:category(?:[-_]slug)?|slug|categoria(?:[-_]slug)?|cat)\s*(?::|=)\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/i
  );
  if (slugAttrMatch) {
    const slugCandidate = slugAttrMatch[1] ?? slugAttrMatch[2] ?? slugAttrMatch[3];
    const slug = toProductListingSlug(slugCandidate);
    if (slug) {
      return {
        type: 'category',
        slug,
        categoryLabel: normalizeLabel(slugCandidate)
      };
    }
  }

  const tokens = trimmed.split(/\s+/);
  const hasMultipleTokens = tokens.length > 1;
  for (const token of tokens) {
    const [rawKey, rawValue] = token.split(/[:=]/, 2);
    if (rawValue !== undefined) {
      const value = rawValue.trim();
      const normalizedValue = value.replace(/\s+/g, '').toLowerCase();
      if (['type', 'source', 'mode'].includes(rawKey.trim().toLowerCase())) {
        if (MANUAL_LISTING_KEYWORDS.has(normalizedValue)) {
          return { type: 'manual', slug: null, categoryLabel: null };
        }
        continue;
      }
      const normalizedKey = rawKey
        .trim()
        .toLowerCase()
        .replace(/[-\s]+/g, '_');
      if (
        ['slug', 'category', 'category_slug', 'categoria', 'categoria_slug', 'cat'].includes(
          normalizedKey
        )
      ) {
        const slug = toProductListingSlug(value);
        if (slug) {
          return {
            type: 'category',
            slug,
            categoryLabel: normalizeLabel(value)
          };
        }
      }
      continue;
    }

    const normalizedToken = token.replace(/\s+/g, '').toLowerCase();
    if (MANUAL_LISTING_KEYWORDS.has(normalizedToken)) {
      return { type: 'manual', slug: null, categoryLabel: null };
    }
    if (!hasMultipleTokens) {
      const slug = toProductListingSlug(token);
      if (slug) {
        return {
          type: 'category',
          slug,
          categoryLabel: normalizeLabel(token)
        };
      }
    }
  }

  const slug = toProductListingSlug(trimmed);
  if (slug) {
    return {
      type: 'category',
      slug,
      categoryLabel: normalizeLabel(trimmed)
    };
  }

  return defaultConfig;
}

export function extractProductListingPlaceholders(content: string): {
  html: string;
  placeholders: ProductListingPlaceholder[];
} {
  if (!content) {
    return { html: '', placeholders: [] };
  }

  const normalizedContent = convertIndicatorSyntax(content);
  const placeholders: ProductListingPlaceholder[] = [];
  const regex = /<!--\s*product[\s_-]*listing(?<details>[\s\S]*?)-->/gi;

  const html = normalizedContent.replace(
    regex,
    (_match, _details, _offset, _input, groups?: { details?: string }) => {
      const details = groups?.details ?? '';
      const config = parseProductListingConfig(details);
      const marker = `__PRODUCT_LISTING_${placeholders.length}__`;
      placeholders.push({ config, marker });
      return marker;
    }
  );

  return { html, placeholders };
}

export async function loadCategoryListing(
  options: {
    config: ProductListingConfig & { slug: string };
    pageParam: number;
    pageKey: string;
    requestId: string;
  }
): Promise<ProductListingRenderData | null> {
  const { config, pageParam, pageKey, requestId } = options;
  const trimmedSlug = config.slug.trim();
  if (!trimmedSlug) {
    return null;
  }

  const matchedCategory = await getPublishedCategoryBySlug(trimmedSlug, { requestId });

  const normalizedLabel = config.categoryLabel?.trim() ?? null;

  let productCategory = matchedCategory && matchedCategory.type === 'product' ? matchedCategory : null;

  if (!productCategory && normalizedLabel) {
    productCategory = await resolveProductCategoryBySlugOrName(normalizedLabel, {
      requestId,
      hintName: matchedCategory?.name ?? null
    });
  }

  if (!productCategory || productCategory.type !== 'product') {
    productCategory = await resolveProductCategoryBySlugOrName(trimmedSlug, {
      requestId,
      hintName: normalizedLabel ?? matchedCategory?.name ?? null
    });
  }

  const category = productCategory ?? matchedCategory ?? createVirtualProductCategoryFromSlug(trimmedSlug);
  const queryCategory = {
    id: category.id,
    slug: category.slug,
    name: normalizedLabel ?? category.name
  };

  const subtitle = normalizedLabel ?? (matchedCategory?.name?.trim() ? matchedCategory.name : category.name);

  const offset = (pageParam - 1) * PAGE_SIZE;
  let { products, totalCount } = await getPublishedProductsForCategory(
    queryCategory,
    {
      limit: PAGE_SIZE,
      offset,
      requestId
    }
  );

  if (totalCount <= 0 || products.length === 0) {
    return null;
  }

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  let currentPage = pageParam;
  if (pageParam > totalPages) {
    currentPage = totalPages;
    const lastOffset = (totalPages - 1) * PAGE_SIZE;
    ({ products } = await getPublishedProductsForCategory(
      queryCategory,
      {
        limit: PAGE_SIZE,
        offset: lastOffset,
        requestId
      }
    ));
  }

  const cards = toCategoryProductCards(products);
  if (cards.length === 0) {
    return null;
  }

  return {
    key: `category-${category.slug}`,
    heading: 'Productos relacionados',
    subtitle,
    cards,
    viewAllHref: `/categories/${category.slug}`,
    pagination:
      totalPages > 1
        ? {
            pageKey,
            currentPage,
            totalPages
          }
        : undefined
  };
}

export async function loadManualListing(productSlugs: string[]): Promise<ProductListingRenderData | null> {
  if (!Array.isArray(productSlugs) || productSlugs.length === 0) {
    return null;
  }

  const results = await getPublishedProductsBySlugs(productSlugs);
  if (!Array.isArray(results) || results.length === 0) {
    return null;
  }

  const cards = toManualProductCards(results);
  if (cards.length === 0) {
    return null;
  }

  return {
    key: 'manual-products',
    heading: 'Productos relacionados',
    cards
  };
}

export function isManualListingKeyword(value: string): boolean {
  return MANUAL_LISTING_KEYWORDS.has(value);
}
