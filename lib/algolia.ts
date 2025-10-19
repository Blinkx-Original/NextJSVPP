export interface AlgoliaConfig {
  appId: string;
  adminApiKey: string;
  indexName: string;
}

export function getAlgoliaConfig(): AlgoliaConfig | null {
  const appId = process.env.ALGOLIA_APP_ID?.trim();
  const adminApiKey = (process.env.ALGOLIA_ADMIN_API_KEY ?? process.env.ALGOLIA_API_KEY)?.trim();
  const indexName = (process.env.ALGOLIA_INDEX_PRIMARY ?? process.env.ALGOLIA_INDEX)?.trim();

  if (!appId || !adminApiKey || !indexName) {
    return null;
  }

  return { appId, adminApiKey, indexName };
}

export interface AlgoliaIndexInfo {
  name: string;
  [key: string]: unknown;
}

export interface ListIndicesResponse {
  items: AlgoliaIndexInfo[];
}

export class AlgoliaTimeoutError extends Error {
  constructor(message = 'Algolia request timed out') {
    super(message);
    this.name = 'AlgoliaTimeoutError';
  }
}

export async function listAlgoliaIndices(
  config: AlgoliaConfig,
  options?: { timeoutMs?: number }
): Promise<ListIndicesResponse> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 10000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof (timer as NodeJS.Timeout).unref === 'function') {
    (timer as NodeJS.Timeout).unref();
  }

  try {
    const response = await fetch(`https://${config.appId}.algolia.net/1/indexes`, {
      method: 'GET',
      headers: {
        'X-Algolia-Application-Id': config.appId,
        'X-Algolia-API-Key': config.adminApiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      signal: controller.signal
    });

    if (response.status === 401 || response.status === 403) {
      throw Object.assign(new Error('Algolia authentication failed'), {
        name: 'AlgoliaAuthError',
        status: response.status
      });
    }

    if (!response.ok) {
      throw new Error(`Algolia request failed with status ${response.status}`);
    }

    return (await response.json()) as ListIndicesResponse;
  } catch (error) {
    if ((error as Error)?.name === 'AbortError') {
      throw new AlgoliaTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
