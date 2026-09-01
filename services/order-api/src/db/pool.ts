import pg from 'pg';
import type { AppConfig } from '../config.js';

const { Pool } = pg;

export function createPool(config: AppConfig) {
  return new Pool({
    connectionString: config.DATABASE_URL,
    max: 8,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
  });
}

export type DatabasePool = ReturnType<typeof createPool>;
