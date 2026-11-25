import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
export const DB = 'DB';

export interface DbHandle {
  db: Db;
  kind: 'pg' | 'pglite';
  close: () => Promise<void>;
}

function migrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    process.env.MIGRATIONS_DIR,
    resolve(here, '../../drizzle'), // src/db → apps/api/drizzle
    resolve(here, '../drizzle'), // dist → apps/api/drizzle
    resolve(process.cwd(), 'drizzle'),
  ].filter((p): p is string => !!p);
  const found = candidates.find((p) => existsSync(resolve(p, 'meta/_journal.json')));
  if (!found) throw new Error(`Drizzle migrations folder not found (looked in ${candidates.join(', ')})`);
  return found;
}

/**
 * Opens the database and applies pending migrations (drizzle-kit generated SQL in apps/api/drizzle).
 * - `url` set → node-postgres
 * - `dataDir` set → PGlite persisted on disk
 * - neither → in-memory PGlite (tests)
 */
export async function openDatabase(opts: { url?: string | null; dataDir?: string | null }): Promise<DbHandle> {
  const folder = migrationsFolder();
  if (opts.url) {
    const pg = (await import('pg')).default;
    const { drizzle } = await import('drizzle-orm/node-postgres');
    const { migrate } = await import('drizzle-orm/node-postgres/migrator');
    const pool = new pg.Pool({ connectionString: opts.url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: folder });
    return { db: db as unknown as Db, kind: 'pg', close: () => pool.end() };
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  let client: InstanceType<typeof PGlite>;
  if (opts.dataDir) {
    const dir = resolve(opts.dataDir);
    mkdirSync(dir, { recursive: true });
    client = new PGlite(dir);
  } else {
    client = new PGlite();
  }
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: folder });
  return { db: db as unknown as Db, kind: 'pglite', close: () => client.close() };
}
