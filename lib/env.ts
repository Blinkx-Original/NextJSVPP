const requiredEnv = ['TIDB_HOST', 'TIDB_PORT', 'TIDB_USER', 'TIDB_PASSWORD', 'TIDB_DATABASE'] as const;

type RequiredEnvKey = (typeof requiredEnv)[number];

type OptionalEnvKey =
  | 'NEXT_PUBLIC_SITE_URL'
  | 'NEXT_PUBLIC_SITE_NAME'
  | 'ALGOLIA_APP_ID'
  | 'ALGOLIA_API_KEY'
  | 'ALGOLIA_INDEX'
  | 'TIDB_SSL_MODE'
  | 'TIDB_SSL_CA';

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

  for (const key of ['NEXT_PUBLIC_SITE_URL', 'NEXT_PUBLIC_SITE_NAME', 'ALGOLIA_APP_ID', 'ALGOLIA_API_KEY', 'ALGOLIA_INDEX', 'TIDB_SSL_MODE', 'TIDB_SSL_CA'] as const) {
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
