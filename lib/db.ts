import mysql from 'mysql2/promise';
import type { ConnectionOptions as TlsConnectionOptions } from 'tls';
import type { AppEnv } from './env';
import { assertEnv } from './env';

const env = () => assertEnv();

let pool: mysql.Pool | undefined;

type TidbSslMode = 'disable' | 'skip-verify' | 'verify-ca' | 'verify-full';

function normalizePort(rawPort: string): number {
  const port = Number.parseInt(rawPort, 10);
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid TIDB_PORT value: ${rawPort}`);
  }
  return port;
}

function decodeCaBundle(ca: string): string {
  const normalized = ca.replace(/\\n/g, '\n');
  if (normalized.includes('-----BEGIN')) {
    return normalized;
  }
  try {
    return Buffer.from(normalized, 'base64').toString('utf8');
  } catch (error) {
    console.warn('[db] unable to decode TIDB_SSL_CA, using raw value');
    return normalized;
  }
}

function resolveSslMode(config: AppEnv): TidbSslMode {
  const mode = config.TIDB_SSL_MODE?.toLowerCase() as TidbSslMode | undefined;
  if (!mode) {
    return 'skip-verify';
  }
  if (mode === 'disable' || mode === 'skip-verify' || mode === 'verify-ca' || mode === 'verify-full') {
    return mode;
  }
  console.warn(`[db] unsupported TIDB_SSL_MODE=${config.TIDB_SSL_MODE}, falling back to skip-verify`);
  return 'skip-verify';
}

function buildSslOptions(config: AppEnv): TlsConnectionOptions | undefined {
  const mode = resolveSslMode(config);
  if (mode === 'disable') {
    return undefined;
  }

  const ssl: TlsConnectionOptions = {
    minVersion: 'TLSv1.2'
  };

  if (mode === 'verify-ca' || mode === 'verify-full') {
    ssl.rejectUnauthorized = true;
  } else {
    ssl.rejectUnauthorized = false;
  }

  if (config.TIDB_SSL_CA) {
    ssl.ca = decodeCaBundle(config.TIDB_SSL_CA);
  }

  if (mode === 'verify-full') {
    ssl.servername = config.TIDB_HOST;
  }

  return ssl;
}

export interface DbErrorInfo {
  code?: string;
  errno?: number;
  sqlState?: string;
  fatal?: boolean;
  message?: string;
}

export function toDbErrorInfo(error: unknown): DbErrorInfo {
  if (!error || typeof error !== 'object') {
    return {};
  }
  const record = error as Record<string, unknown>;
  const info: DbErrorInfo = {};
  if (typeof record.code === 'string') {
    info.code = record.code;
  }
  if (typeof record.errno === 'number') {
    info.errno = record.errno;
  }
  if (typeof record.sqlState === 'string') {
    info.sqlState = record.sqlState;
  }
  if (typeof record.fatal === 'boolean') {
    info.fatal = record.fatal;
  }
  if (typeof record.message === 'string') {
    info.message = record.message;
  }
  return info;
}

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = env();
    const ssl = buildSslOptions(config);
    pool = mysql.createPool({
      host: config.TIDB_HOST,
      port: normalizePort(config.TIDB_PORT),
      user: config.TIDB_USER,
      password: config.TIDB_PASSWORD,
      database: config.TIDB_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      enableKeepAlive: true,
      keepAliveInitialDelay: 0,
      connectTimeout: 15000,
      ssl,
      supportBigNumbers: true
    });
  }
  return pool;
}

export async function pingDatabase(): Promise<void> {
  const connection = await getPool().getConnection();
  try {
    await connection.query('SELECT 1');
  } finally {
    connection.release();
  }
}
