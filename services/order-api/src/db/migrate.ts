import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config.js';
import { createPool } from './pool.js';

export async function migrate() {
  const config = loadConfig();
  const pool = createPool(config);
  const migrationsDirectory = fileURLToPath(new URL('../../migrations/', import.meta.url));
  const client = await pool.connect();

  try {
    await client.query('SELECT pg_advisory_lock($1)', [241_198_856]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      try {
        await client.query('BEGIN');
        const alreadyApplied = await client.query<{ name: string }>(
          'SELECT name FROM schema_migrations WHERE name = $1 FOR UPDATE',
          [file],
        );
        if (!alreadyApplied.rowCount) {
          await client.query(await readFile(`${migrationsDirectory}/${file}`, 'utf8'));
          await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    }
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [241_198_856]).catch(() => undefined);
    client.release();
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Неизвестная ошибка миграции';
    process.stderr.write(`Миграция базы не выполнена: ${message}\n`);
    process.exitCode = 1;
  });
}
