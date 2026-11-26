import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { NotificationScheduler } from '../src/modules/notification-scheduler';
import type { NotificationsService } from '../src/modules/notifications.service';
import { createTestApp, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});

const fakeNotifications = (impl: () => Promise<unknown>) => ({ processDue: impl }) as unknown as NotificationsService;

describe('notification scheduler', () => {
  it('takes the advisory lock and runs a pass', async () => {
    let passes = 0;
    const scheduler = new NotificationScheduler(
      fakeNotifications(async () => {
        passes++;
        return { deferredSent: 0, deferredSkipped: 0, topPicksQueued: 0 };
      }),
      ctx.db,
    );
    expect(await scheduler.tick()).toBe(true);
    expect(await scheduler.tick()).toBe(true); // the lock is released when each pass's transaction ends
    expect(passes).toBe(2);
  });

  it('never throws when a pass fails', async () => {
    const scheduler = new NotificationScheduler(
      fakeNotifications(async () => {
        throw new Error('push provider down');
      }),
      ctx.db,
    );
    expect(await scheduler.tick()).toBe(false);
  });
});

describe('health check', () => {
  it('is public and reports the database and realtime transport', async () => {
    const res = await ctx.http.get('/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', database: 'ok', realtime: 'local' });
  });
});
