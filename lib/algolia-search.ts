export interface AlgoliaSearchConfig {
  appId: string;
  apiKey: string;
  indexName: string;
}

export interface AlgoliaProductHit {
  objectID?: string;
  title?: string;
  name?: string;
  slug?: string;
  sku?: string;
  price?: string | number;
  url?: string;
  wp_url?: string;
  image?: string;
  images?: string[];
  short_description?: string;
  categories?: string[] | string;
  [key: string]: unknown;
}

export interface AlgoliaSearchResponse {
  hits: AlgoliaProductHit[];
  nbHits: number;
  page: number;
  nbPages: number;
  facets: Record<string, Record<string, number>>;
}

export interface AlgoliaSearchOptions {
  query?: string;
  page?: number;
  hitsPerPage?: number;
  filters?: string;
  facetFilters?: Array<string | string[]>;
  facets?: string[];
}

const ATTRIBUTES_TO_RETRIEVE = [
  "objectID",
  "title",
  "name",
  "slug",
  "sku",
  "price",
  "url",
  "wp_url",
  "image",
  "images",
  "short_description",
  "categories"
] as const;

export function getAlgoliaSearchConfig(): AlgoliaSearchConfig | null {
  const appId = process.env.ALGOLIA_APP_ID?.trim();
  const indexName = (process.env.ALGOLIA_INDEX ?? process.env.ALGOLIA_INDEX_PRIMARY)?.trim();
  const apiKey = (process.env.ALGOLIA_API_KEY ?? process.env.ALGOLIA_ADMIN_API_KEY)?.trim();

  if (!appId || !indexName || !apiKey) {
    return null;
  }

  return { appId, indexName, apiKey };
}

function toQueryPayload(config: AlgoliaSearchOptions) {
  const payload: Record<string, unknown> = {
    query: config.query ?? "",
    page: Math.max(0, (config.page ?? 1) - 1),
    hitsPerPage: config.hitsPerPage ?? 8,
    attributesToRetrieve: ATTRIBUTES_TO_RETRIEVE,
    attributesToHighlight: [],
    facets: config.facets ?? ["*"],
    responseFields: ["*"],
    typoTolerance: "min",
    removeStopWords: ["en"],
    ignorePlurals: ["en"],
    queryLanguages: ["en"]
  };

  if (config.filters) {
    payload.filters = config.filters;
  }
  if (config.facetFilters && config.facetFilters.length > 0) {
    payload.facetFilters = config.facetFilters;
  }

  return payload;
}

export async function searchAlgoliaProducts(options: AlgoliaSearchOptions = {}): Promise<AlgoliaSearchResponse> {
  const config = getAlgoliaSearchConfig();
  if (!config) {
    throw new Error("Missing Algolia configuration");
  }

  const payload = toQueryPayload(options);
  const response = await fetch(
    `https://${config.appId}-dsn.algolia.net/1/indexes/${encodeURIComponent(config.indexName)}/query`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Algolia-Application-Id": config.appId,
        "X-Algolia-API-Key": config.apiKey
      },
      body: JSON.stringify(payload),
      // Algolia recommends a short timeout; rely on platform defaults here.
      cache: "no-store"
    }
  );

  if (!response.ok) {
    throw new Error(`Algolia request failed with status ${response.status}`);
  }

  const data = (await response.json()) as Partial<AlgoliaSearchResponse & { nbHits?: number; nbPages?: number; page?: number; facets?: Record<string, Record<string, number>>; hits?: AlgoliaProductHit[] }>;

  return {
    hits: Array.isArray(data.hits) ? data.hits : [],
    nbHits: typeof data.nbHits === "number" ? data.nbHits : 0,
    page: typeof data.page === "number" ? data.page + 1 : 1,
    nbPages: typeof data.nbPages === "number" ? data.nbPages : 0,
    facets: data.facets ?? {}
  };
}
