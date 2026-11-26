import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

/** Every minute: deferred (quiet-hours) pushes and the daily Top Picks reminder. Disabled in tests. */
@Injectable()
export class NotificationScheduler implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger('NotificationScheduler');
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(@Inject(NotificationsService) private readonly notifications: NotificationsService) {}

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

  async tick(now = new Date()): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const r = await this.notifications.processDue(now);
      if (r.deferredSent || r.topPicksQueued) this.log.log(`sent ${r.deferredSent} deferred, queued ${r.topPicksQueued} Top Picks reminders`);
    } catch (e) {
      this.log.error(`tick failed: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
