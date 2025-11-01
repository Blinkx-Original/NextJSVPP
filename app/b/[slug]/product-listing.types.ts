export const PRODUCT_LISTING_HEADING = 'Productos relacionados';

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
