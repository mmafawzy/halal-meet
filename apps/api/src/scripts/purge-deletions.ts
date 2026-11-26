/**
 * `pnpm --filter @halal-meet/api purge:deletions` — permanently erases accounts whose deletion grace period
 * (DELETION_GRACE_DAYS, default 30) has passed. Safe to run repeatedly (e.g. a daily cron).
 */
import 'reflect-metadata';
import { loadConfig } from '../config';
import { openDatabase } from '../db/client';
import { deletionGraceDays, purgeExpiredDeletions } from '../modules/privacy.service';

async function main(): Promise<void> {
  const config = loadConfig();
  const handle = await openDatabase({ url: config.databaseUrl, dataDir: config.pgliteDir });
  try {
    const erased = await purgeExpiredDeletions(handle.db, new Date(), deletionGraceDays());
    // eslint-disable-next-line no-console
    console.log(`[purge] erased ${erased.length} account(s) past the ${deletionGraceDays()}-day grace period`);
  } finally {
    await handle.close();
  }
}

void main();
