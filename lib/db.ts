import mysql from 'mysql2/promise';
import { assertEnv } from './env';

const env = () => assertEnv();

let pool: mysql.Pool | undefined;

export function getPool(): mysql.Pool {
  if (!pool) {
    const config = env();
    pool = mysql.createPool({
      host: config.TIDB_HOST,
      port: Number(config.TIDB_PORT),
      user: config.TIDB_USER,
      password: config.TIDB_PASSWORD,
      database: config.TIDB_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      ssl: {
        minVersion: 'TLSv1.2',
        rejectUnauthorized: false
      }
    });
  }
  return pool;
}

export async function pingDatabase(): Promise<boolean> {
  try {
    const connection = await getPool().getConnection();
    await connection.ping();
    connection.release();
    return true;
  } catch (error) {
    console.error('[healthz] DB ping failed', error);
    return false;
  }
}
