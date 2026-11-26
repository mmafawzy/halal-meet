import 'reflect-metadata';
import type { AddressInfo } from 'node:net';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultGuardianPermissions } from '@halal-meet/core';
import { AppModule } from '../src/app.module';
import { DB, openDatabase, type DbHandle } from '../src/db/client';
import * as t from '../src/db/schema';
import { uuidv7 } from '../src/common/ids';
import { FeedService } from '../src/modules/feed.service';
import { NotificationsService } from '../src/modules/notifications.service';
import { LogPushDriver, PUSH_DRIVER } from '../src/modules/push';
import { topPicksCycle } from '../src/modules/top-picks-time';
import { COMPATIBLE_ANSWERS } from './fixtures';
import { createMember, login, truncateAll, type TestContext } from './helpers';

let ctx: TestContext;
let app: NestExpressApplication;
let notifications: NotificationsService;
let feed: FeedService;
let push: LogPushDriver;
let baseUrl: string;

beforeAll(async () => {
  process.env.PGLITE_DIR = 'memory';
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  const handle: DbHandle = await openDatabase({ url: null, dataDir: null });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(DB).useValue(handle.db).compile();
  app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.listen(0, '127.0.0.1');
  baseUrl = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
  notifications = app.get(NotificationsService);
  feed = app.get(FeedService);
  push = app.get<LogPushDriver>(PUSH_DRIVER);
  ctx = {
    db: handle.db,
    http: request(app.getHttpServer() as App),
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await truncateAll(ctx.db);
  push.sent.length = 0;
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
/** 14:00 in Cairo (UTC+2 in November): outside quiet hours. */
const DAYTIME = new Date('2026-11-26T12:00:00Z');
/** 02:00 in Cairo: inside quiet hours. */
const NIGHT = new Date('2026-11-26T00:00:00Z');

async function inbox(accountId: string) {
  return ctx.db.select().from(t.notifications).where(eq(t.notifications.accountId, accountId)).orderBy(t.notifications.createdAt);
}

async function withDevice(accountId: string, token = `ExponentPushToken[${accountId.slice(-12)}]`) {
  await notifications.registerDevice(accountId, 'ios', token);
  return token;
}

describe('devices', () => {
  it('upserts by push token (the last account to sign in on a device owns it) and deletes only your own', async () => {
    const a = await createMember(ctx, { gender: 'male' });
    const b = await createMember(ctx, { gender: 'female' });
    const aToken = await login(ctx, a.phone);
    const bToken = await login(ctx, b.phone);
    const pushToken = 'ExponentPushToken[shared-device-1]';

    await ctx.http.post('/me/devices').set(auth(aToken)).send({ platform: 'ios', pushToken }).expect(200);
    await ctx.http.post('/me/devices').set(auth(aToken)).send({ platform: 'ios', pushToken }).expect(200);
    let rows = await ctx.db.select().from(t.devices);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.accountId).toBe(a.id);

    await ctx.http.post('/me/devices').set(auth(bToken)).send({ platform: 'android', pushToken }).expect(200);
    rows = await ctx.db.select().from(t.devices);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ accountId: b.id, platform: 'android' });

    await ctx.http.delete(`/me/devices/${encodeURIComponent(pushToken)}`).set(auth(aToken)).expect(200);
    expect(await ctx.db.select().from(t.devices)).toHaveLength(1); // not A's any more
    await ctx.http.delete(`/me/devices/${encodeURIComponent(pushToken)}`).set(auth(bToken)).expect(200);
    expect(await ctx.db.select().from(t.devices)).toHaveLength(0);

    await ctx.http.post('/me/devices').set(auth(aToken)).send({ platform: 'symbian', pushToken }).expect(400);
  });
});

describe('preferences', () => {
  it('returns defaults, merges partial updates and validates the Top Picks time', async () => {
    const a = await createMember(ctx, { gender: 'male' });
    const token = await login(ctx, a.phone);
    const defaults = await ctx.http.get('/me/notification-prefs').set(auth(token)).expect(200);
    expect(defaults.body).toEqual({
      categories: { matches: true, messages: true, interests: true, family: true, topPicks: true, tips: true },
      topPicksTime: 'maghrib',
      quietHours: true,
    });

    const put = await ctx.http.put('/me/notification-prefs').set(auth(token)).send({ categories: { messages: false }, topPicksTime: '21:30' }).expect(200);
    expect(put.body.categories).toMatchObject({ messages: false, matches: true });
    expect(put.body.topPicksTime).toBe('21:30');
    const again = await ctx.http.put('/me/notification-prefs').set(auth(token)).send({ quietHours: false }).expect(200);
    expect(again.body).toMatchObject({ topPicksTime: '21:30', quietHours: false, categories: { messages: false } });

    await ctx.http.put('/me/notification-prefs').set(auth(token)).send({ topPicksTime: '25:00' }).expect(400);
    await ctx.http.put('/me/notification-prefs').set(auth(token)).send({ categories: { spam: true } }).expect(400);
  });

  it('skips the push for a switched-off category but still records the inbox item', async () => {
    const a = await createMember(ctx, { gender: 'male' });
    await withDevice(a.id);
    await notifications.putPrefs(a.id, { categories: { messages: false } });

    await notifications.notify(a.id, 'message', { matchId: uuidv7(), messageId: uuidv7() }, DAYTIME);
    await notifications.notify(a.id, 'match', { matchId: uuidv7(), otherId: uuidv7() }, DAYTIME);
    await notifications.notify(a.id, 'account_notice', {}, DAYTIME); // unknown kinds cannot be switched off

    const rows = await inbox(a.id);
    expect(rows.map((r) => [r.kind, r.pushStatus])).toEqual([
      ['message', 'skipped'],
      ['match', 'sent'],
      ['account_notice', 'sent'],
    ]);
    expect(push.sent.map((m) => m.data.kind)).toEqual(['match', 'account_notice']);
    expect(push.sent[0]!.data.url).toMatch(/^\/chat\//);
  });

  it('skips the push when the member has no device', async () => {
    const a = await createMember(ctx, { gender: 'male' });
    await notifications.notify(a.id, 'match', { matchId: uuidv7() }, DAYTIME);
    expect((await inbox(a.id))[0]!.pushStatus).toBe('skipped');
  });
});

describe('quiet hours', () => {
  it('defers pushes 23:00–08:00 local and sends them in the morning', async () => {
    const a = await createMember(ctx, { gender: 'male', country: 'EG' });
    await withDevice(a.id);
    await notifications.notify(a.id, 'match', { matchId: uuidv7() }, NIGHT);
    expect((await inbox(a.id))[0]!.pushStatus).toBe('deferred');
    expect(push.sent).toHaveLength(0);

    // 04:00 Cairo: still quiet.
    expect((await notifications.processDue(new Date('2026-11-26T02:00:00Z'))).deferredSent).toBe(0);
    // 07:30 Cairo: still quiet (the window ends at 08:00).
    expect((await notifications.processDue(new Date('2026-11-26T05:30:00Z'))).deferredSent).toBe(0);
    // 08:30 Cairo: delivered.
    const r = await notifications.processDue(new Date('2026-11-26T06:30:00Z'));
    expect(r.deferredSent).toBe(1);
    expect((await inbox(a.id))[0]!.pushStatus).toBe('sent');
    expect(push.sent).toHaveLength(1);
  });

  it('uses the member’s own timezone, can be switched off, and drops deferred pushes already read in the app', async () => {
    // 00:00Z is 19:00 in New York: not quiet there.
    const ny = await createMember(ctx, { gender: 'male', country: 'US', city: 'New York' });
    await withDevice(ny.id);
    await notifications.notify(ny.id, 'match', { matchId: uuidv7() }, NIGHT);
    expect((await inbox(ny.id))[0]!.pushStatus).toBe('sent');

    const owl = await createMember(ctx, { gender: 'female', country: 'EG' });
    await withDevice(owl.id);
    await notifications.putPrefs(owl.id, { quietHours: false });
    await notifications.notify(owl.id, 'match', { matchId: uuidv7() }, NIGHT);
    expect((await inbox(owl.id))[0]!.pushStatus).toBe('sent');

    const reader = await createMember(ctx, { gender: 'female', country: 'EG' });
    await withDevice(reader.id);
    await notifications.notify(reader.id, 'match', { matchId: uuidv7() }, NIGHT);
    await notifications.markRead(reader.id, { all: true });
    const r = await notifications.processDue(new Date('2026-11-26T06:00:00Z'));
    expect(r.deferredSkipped).toBe(1);
    expect((await inbox(reader.id))[0]!.pushStatus).toBe('skipped');
  });
});

describe('inbox', () => {
  it('paginates newest first with ?before= and tracks read state', async () => {
    const a = await createMember(ctx, { gender: 'male' });
    const token = await login(ctx, a.phone);
    for (let i = 0; i < 25; i++) {
      await notifications.notify(a.id, 'top_picks', { day: `d${i}` }, new Date(DAYTIME.getTime() + i * 60_000));
    }
    const p1 = await ctx.http.get('/notifications').set(auth(token)).expect(200);
    expect(p1.body.items).toHaveLength(20);
    expect(p1.body.items[0].payload.day).toBe('d24');
    expect(p1.body.unread).toBe(25);
    expect(p1.body.nextBefore).toBeTruthy();
    const p2 = await ctx.http.get(`/notifications?before=${p1.body.nextBefore}`).set(auth(token)).expect(200);
    expect(p2.body.items.map((i: { payload: { day: string } }) => i.payload.day)).toEqual(['d4', 'd3', 'd2', 'd1', 'd0']);
    expect(p2.body.nextBefore).toBeNull();

    const read = await ctx.http.post('/notifications/read').set(auth(token)).send({ ids: [p1.body.items[0].id, p1.body.items[1].id] }).expect(200);
    expect(read.body.unread).toBe(23);
    const first = await ctx.http.get('/notifications?limit=2').set(auth(token)).expect(200);
    expect(first.body.items.map((i: { read: boolean }) => i.read)).toEqual([true, true]);
    expect((await ctx.http.get('/notifications/unread-count').set(auth(token)).expect(200)).body).toEqual({ unread: 23 });

    await ctx.http.post('/notifications/read').set(auth(token)).send({ all: true }).expect(200);
    expect((await ctx.http.get('/notifications/unread-count').set(auth(token)).expect(200)).body.unread).toBe(0);
    await ctx.http.post('/notifications/read').set(auth(token)).send({}).expect(400);

    // Someone else's ids are ignored.
    const b = await createMember(ctx, { gender: 'female' });
    await notifications.notify(b.id, 'match', {});
    const bItem = (await inbox(b.id))[0]!;
    await ctx.http.post('/notifications/read').set(auth(token)).send({ ids: [bItem.id] }).expect(200);
    expect((await inbox(b.id))[0]!.readAt).toBeNull();
  });
});

describe('triggers', () => {
  it('incoming interest: count only for a free recipient, full for Plus; Serious Interest always shows', async () => {
    const sender = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const free = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const plus = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS, subscription: 'plus' });
    const serious = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, sender.phone);

    await ctx.http.post('/interests').set(auth(token)).send({ toId: free.id, level: 'interest' }).expect(200);
    await ctx.http.post('/interests').set(auth(token)).send({ toId: plus.id, level: 'interest' }).expect(200);
    await ctx.http.post('/interests').set(auth(token)).send({ toId: serious.id, level: 'serious', note: 'Assalamu alaikum' }).expect(200);

    const [f] = await inbox(free.id);
    expect(f).toMatchObject({ kind: 'interest', payload: { level: 'interest', countOnly: true } });
    expect(JSON.stringify(f!.payload)).not.toContain(sender.id);
    expect((await inbox(plus.id))[0]).toMatchObject({ kind: 'interest', payload: { fromId: sender.id, firstName: 'Ahmed', level: 'interest' } });
    expect((await inbox(serious.id))[0]).toMatchObject({ kind: 'serious_interest', payload: { fromId: sender.id, level: 'serious' } });
    expect(await inbox(sender.id)).toHaveLength(0);
  });

  it('mutual match notifies both (no push to the one who just tapped), messages notify the recipient and collapse per thread', async () => {
    const ahmed = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS, subscription: 'plus' });
    const sara = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS, subscription: 'plus' });
    await withDevice(ahmed.id);
    await withDevice(sara.id);
    const aToken = await login(ctx, ahmed.phone);
    const sToken = await login(ctx, sara.phone);

    await ctx.http.post('/interests').set(auth(aToken)).send({ toId: sara.id, level: 'interest' }).expect(200);
    const res = await ctx.http.post('/interests').set(auth(sToken)).send({ toId: ahmed.id, level: 'interest' }).expect(200);
    const matchId = res.body.matchId as string;
    expect(res.body.matched).toBe(true);

    const ahmedMatch = (await inbox(ahmed.id)).find((r) => r.kind === 'match')!;
    const saraMatch = (await inbox(sara.id)).find((r) => r.kind === 'match')!;
    expect(ahmedMatch).toMatchObject({ payload: { matchId, otherId: sara.id, firstName: 'Sara' } });
    expect(saraMatch).toMatchObject({ payload: { matchId, otherId: ahmed.id, initiatedByYou: true } });
    expect(saraMatch.pushStatus).toBe('skipped');

    await ctx.http.post(`/matches/${matchId}/messages`).set(auth(aToken)).send({ kind: 'text', body: 'Assalamu alaikum' }).expect(200);
    await ctx.http.post(`/matches/${matchId}/messages`).set(auth(aToken)).send({ kind: 'text', body: 'How are you?' }).expect(200);
    const msgs = (await inbox(sara.id)).filter((r) => r.kind === 'message');
    expect(msgs).toHaveLength(1);
    expect(msgs[0]!.payload).toMatchObject({ matchId, senderId: ahmed.id, firstName: 'Ahmed', count: 2 });
    expect((await inbox(ahmed.id)).filter((r) => r.kind === 'message')).toHaveLength(0);
    // Lock-screen copy never contains the message text.
    expect(JSON.stringify(push.sent)).not.toContain('How are you');

    // Opening the chat clears that thread's item; the next message starts a fresh one.
    await ctx.http.post('/notifications/read').set(auth(sToken)).send({ matchId }).expect(200);
    await ctx.http.post(`/matches/${matchId}/messages`).set(auth(aToken)).send({ kind: 'text', body: 'Third' }).expect(200);
    const after = (await inbox(sara.id)).filter((r) => r.kind === 'message');
    expect(after).toHaveLength(2);
    expect(after.find((r) => r.readAt === null)!.payload.count).toBe(1);
  });

  it('guardian events: accepted, opinion and stage decision → member; removed → guardian (neutral)', async () => {
    const sara = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const ahmed = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const matchId = uuidv7();
    await ctx.db.insert(t.matches).values({ id: matchId, aId: sara.id, bId: ahmed.id, stage: 4, status: 'active' });
    const saraToken = await login(ctx, sara.phone);
    const invite = await ctx.http.post('/guardians').set(auth(saraToken)).send({ name: 'Baba', relationship: 'father', permissions: defaultGuardianPermissions('wali') }).expect(201);
    const fatherToken = await login(ctx, '+201099000077');
    await ctx.http.post(`/guardian-invites/${invite.body.inviteCode}/accept`).set(auth(fatherToken)).expect(200);
    await ctx.http.put(`/guardian/members/${sara.id}/opinions/${ahmed.id}`).set(auth(fatherToken)).send({ opinion: 'support' }).expect(200);
    await ctx.http.put(`/guardian/members/${sara.id}/approvals/${matchId}`).set(auth(fatherToken)).send({ stage: 5, decision: 'discuss' }).expect(200);

    const kinds = (await inbox(sara.id)).map((r) => [r.kind, r.payload.guardianName]);
    expect(kinds).toEqual([
      ['guardian_accepted', 'Baba'],
      ['guardian_opinion', 'Baba'],
      ['guardian_stage_decision', 'Baba'],
    ]);
    expect((await inbox(sara.id))[2]!.payload).toMatchObject({ matchId, stage: 5, decision: 'discuss' });

    const [father] = await ctx.db.select().from(t.accounts).where(eq(t.accounts.phoneE164, '+201099000077'));
    await ctx.http.delete(`/guardians/${invite.body.guardian.id}`).set(auth(saraToken)).expect((r) => expect(r.status).toBeLessThan(300));
    const removed = await inbox(father!.id);
    expect(removed).toHaveLength(1);
    expect(removed[0]).toMatchObject({ kind: 'guardian_removed', payload: { memberId: sara.id } });
  });
});

describe('Top Picks timing', () => {
  it('refreshes after Maghrib in the member’s local time instead of at UTC midnight', async () => {
    // Cairo, November (UTC+2). Approximate Maghrib 17:45 + 30 min → 18:15 local = 16:15Z.
    expect(topPicksCycle(new Date('2026-11-26T10:00:00Z'), 'EG', 'maghrib')).toMatchObject({
      day: '2026-11-25',
      refreshesAt: new Date('2026-11-26T16:15:00Z'),
    });
    expect(topPicksCycle(new Date('2026-11-26T17:00:00Z'), 'EG', 'maghrib')).toMatchObject({
      day: '2026-11-26',
      startsAt: new Date('2026-11-26T16:15:00Z'),
      refreshesAt: new Date('2026-11-27T16:15:00Z'),
    });
    // A custom time and presets, in Dubai (UTC+4).
    expect(topPicksCycle(new Date('2026-11-26T10:00:00Z'), 'AE', '21:00').refreshesAt).toEqual(new Date('2026-11-26T17:00:00Z'));
    expect(topPicksCycle(new Date('2026-11-26T10:00:00Z'), 'AE', 'morning').refreshesAt).toEqual(new Date('2026-11-27T04:00:00Z'));
  });

  it('GET /top-picks keeps the same picks until the local refresh, then picks again', async () => {
    await ctx.db.insert(t.countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const viewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    for (let i = 0; i < 4; i++) await createMember(ctx, { gender: 'female', age: 26 + i, answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, viewer.phone);

    const res = await ctx.http.get('/top-picks').set(auth(token)).expect(200);
    const expected = topPicksCycle(new Date(), 'EG', 'maghrib');
    expect(res.body.refreshesAt).toBe(expected.refreshesAt.toISOString());

    const morning = await feed.topPicks(viewer.id, new Date('2026-11-26T08:00:00Z'));
    const noon = await feed.topPicks(viewer.id, new Date('2026-11-26T12:00:00Z'));
    expect(noon.cards.map((c) => c.id)).toEqual(morning.cards.map((c) => c.id));
    expect(morning.refreshesAt).toBe('2026-11-26T16:15:00.000Z');
    await feed.topPicks(viewer.id, new Date('2026-11-26T17:00:00Z'));
    const days = await ctx.db.select({ d: t.topPicks.pickDate }).from(t.topPicks).where(eq(t.topPicks.accountId, viewer.id));
    expect(new Set(days.map((r) => r.d))).toEqual(new Set([expected.day, '2026-11-25', '2026-11-26']));
  });

  it('sends the daily Top Picks reminder once, at the member’s chosen local time', async () => {
    const a = await createMember(ctx, { gender: 'male', country: 'EG' });
    const b = await createMember(ctx, { gender: 'female', country: 'EG' });
    await notifications.putPrefs(b.id, { categories: { topPicks: false } });

    expect((await notifications.processDue(new Date('2026-11-26T15:00:00Z'))).topPicksQueued).toBe(0); // before 18:15 Cairo
    expect((await notifications.processDue(new Date('2026-11-26T16:20:00Z'))).topPicksQueued).toBe(1);
    expect((await notifications.processDue(new Date('2026-11-26T16:21:00Z'))).topPicksQueued).toBe(0);
    const rows = await ctx.db.select().from(t.notifications).where(and(eq(t.notifications.accountId, a.id), eq(t.notifications.kind, 'top_picks')));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.payload).toEqual({ day: '2026-11-26' });
    expect(await inbox(b.id)).toHaveLength(0);
  });
});

describe('realtime events (SSE)', () => {
  it('rejects a missing token and streams a message event to the recipient', async () => {
    expect((await fetch(`${baseUrl}/events`)).status).toBe(401);

    const ahmed = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const sara = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const matchId = uuidv7();
    await ctx.db.insert(t.matches).values({ id: matchId, aId: ahmed.id, bId: sara.id, stage: 1, status: 'active' });
    const aToken = await login(ctx, ahmed.phone);
    const sToken = await login(ctx, sara.phone);

    const controller = new AbortController();
    const res = await fetch(`${baseUrl}/events?token=${sToken}`, { signal: controller.signal });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const waitFor = async (needle: string) => {
      const deadline = Date.now() + 10_000;
      while (!buffer.includes(needle)) {
        if (Date.now() > deadline) throw new Error(`timed out waiting for ${needle}; got ${buffer}`);
        const { value, done } = await reader.read();
        if (done) throw new Error('stream closed');
        buffer += decoder.decode(value, { stream: true });
      }
    };
    try {
      await waitFor('event: ready');

      const sent = await ctx.http.post(`/matches/${matchId}/messages`).set(auth(aToken)).send({ kind: 'text', body: 'Salam' }).expect(200);
      await waitFor('event: message');
      const line = buffer.split('\n\n').find((b) => b.startsWith('event: message'))!;
      expect(JSON.parse(line.split('data: ')[1]!)).toEqual({ matchId, messageId: sent.body.id });
      await waitFor('event: notification');
    } finally {
      controller.abort();
    }
  });
});
