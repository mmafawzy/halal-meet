import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/client';
import { NotificationsService } from './notifications.service';

/** Arbitrary constant key for the scheduler's Postgres advisory lock (one runner across all API instances). */
export const SCHEDULER_LOCK_KEY = 7_340_921;

/** Every minute: deferred (quiet-hours) pushes and the daily Top Picks reminder. Disabled in tests. */
@Injectable()
export class NotificationScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('NotificationScheduler');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(DB) private readonly db: Db,
  ) {}

  static enabled(env: NodeJS.ProcessEnv = process.env): boolean {
    if (env.NODE_ENV === 'test' || env.VITEST) return false;
    return env.NOTIFICATION_SCHEDULER !== 'off';
  }

  onApplicationBootstrap(): void {
    if (!NotificationScheduler.enabled()) return;
    this.timer = setInterval(() => void this.tick(), 60_000);
    this.timer.unref?.();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Runs one pass if no other instance is running one. The transaction-scoped advisory lock is released
   * automatically when the transaction ends, even if this process crashes mid-pass.
   * Returns false when another instance held the lock.
   */
  async tick(now = new Date()): Promise<boolean> {
    if (this.running) return false;
    this.running = true;
    try {
      return await this.db.transaction(async (tx) => {
        const res = (await tx.execute(sql`select pg_try_advisory_xact_lock(${SCHEDULER_LOCK_KEY}) as locked`)) as unknown as
          | { rows: Array<{ locked: boolean }> }
          | Array<{ locked: boolean }>;
        const rows = Array.isArray(res) ? res : res.rows;
        if (!rows[0]?.locked) return false;
        const r = await this.notifications.processDue(now);
        if (r.deferredSent || r.topPicksQueued) this.log.log(`sent ${r.deferredSent} deferred, queued ${r.topPicksQueued} Top Picks reminders`);
        return true;
      });
    } catch (e) {
      this.log.error(`tick failed: ${(e as Error).message}`);
      return false;
    } finally {
      this.running = false;
    }
  }
}
