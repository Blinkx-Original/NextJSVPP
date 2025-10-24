const requiredEnv = ['TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE'] as const;

type RequiredEnvKey = (typeof requiredEnv)[number];

type OptionalEnvKey =
  | 'NEXT_PUBLIC_SITE_URL'
  | 'NEXT_PUBLIC_SITE_NAME'
  | 'ALGOLIA_APP_ID'
  | 'ALGOLIA_API_KEY'
  | 'ALGOLIA_INDEX'
  | 'ALGOLIA_ADMIN_API_KEY'
  | 'ALGOLIA_INDEX_PRIMARY'
  | 'TIDB_SSL_MODE'
  | 'TIDB_SSL_CA'
  | 'CLOUDFLARE_ZONE_ID'
  | 'CLOUDFLARE_API_TOKEN'
  | 'CLOUDFLARE_ENABLE_PURGE_ON_PUBLISH'
  | 'CLOUDFLARE_INCLUDE_PRODUCT_URLS'
  | 'CF_IMAGES_ENABLED'
  | 'CF_IMAGES_ACCOUNT_ID'
  | 'CF_IMAGES_TOKEN'
  | 'CF_IMAGES_BASE_URL';

type EnvShape = Record<RequiredEnvKey, string> & Partial<Record<OptionalEnvKey, string>>;

function getEnv(): EnvShape {
  const output = {} as EnvShape;
  for (const key of requiredEnv) {
    const rawValue = process.env[key];
    if (rawValue == null) {
      throw new Error(`Missing required environment variable ${key}`);
    }
    const value = rawValue.trim();
    if (!value) {
      throw new Error(`Missing required environment variable ${key}`);
    }
    output[key] = value;
  }

  for (const key of [
    'NEXT_PUBLIC_SITE_URL',
    'NEXT_PUBLIC_SITE_NAME',
    'ALGOLIA_APP_ID',
    'ALGOLIA_API_KEY',
    'ALGOLIA_INDEX',
    'ALGOLIA_ADMIN_API_KEY',
    'ALGOLIA_INDEX_PRIMARY',
    'TIDB_SSL_MODE',
    'TIDB_SSL_CA',
    'CLOUDFLARE_ZONE_ID',
    'CLOUDFLARE_API_TOKEN',
    'CLOUDFLARE_ENABLE_PURGE_ON_PUBLISH',
    'CLOUDFLARE_INCLUDE_PRODUCT_URLS',
    'CF_IMAGES_ENABLED',
    'CF_IMAGES_ACCOUNT_ID',
    'CF_IMAGES_TOKEN',
    'CF_IMAGES_BASE_URL'
  ] as const) {
    const value = process.env[key];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        output[key] = trimmed;
      }
    }
  }

  return output;
}

export type AppEnv = ReturnType<typeof getEnv>;

export function safeGetEnv(): AppEnv | null {
  try {
    return getEnv();
  } catch (error) {
    return null;
  }
}

export function assertEnv(): AppEnv {
  return getEnv();
}
