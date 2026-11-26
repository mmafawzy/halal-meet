import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as t from '../src/db/schema';
import { uuidv7 } from '../src/common/ids';
import { purgeExpiredDeletions } from '../src/modules/privacy.service';
import { createMember, createTestApp, login, truncateAll, type TestContext } from './helpers';
import { COMPATIBLE_ANSWERS } from './fixtures';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await truncateAll(ctx.db);
  await ctx.db.insert(t.countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
});

const DAY = 86_400_000;
type FeedBody = { items: Array<{ type: string; card?: { id: string } }>; passportSuggestions: Array<{ country: string; compatibleCount: number }> };
const feedIds = (body: FeedBody) => body.items.filter((i) => i.type === 'profile').map((i) => i.card!.id);
const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function surfaces(token: string) {
  const [feed, picks, incoming] = await Promise.all([
    ctx.http.get('/feed').set(auth(token)).expect(200),
    ctx.http.get('/top-picks').set(auth(token)).expect(200),
    ctx.http.get('/interests/incoming').set(auth(token)).expect(200),
  ]);
  return {
    feed: feedIds(feed.body as FeedBody),
    picks: (picks.body.cards as Array<{ id: string }>).map((c) => c.id),
    incoming: (incoming.body.cards as Array<{ id: string }>).map((c) => c.id),
    incomingCount: incoming.body.count as number,
  };
}

async function interest(fromId: string, toId: string, status = 'pending') {
  await ctx.db.insert(t.interests).values({ id: uuidv7(), fromId, toId, level: 'interest', status });
}

async function match(a: string, b: string) {
  const [x, y] = a < b ? [a, b] : [b, a];
  const id = uuidv7();
  await ctx.db.insert(t.matches).values({ id, aId: x, bId: y, stage: 1, status: 'active' });
  return id;
}

/** A Plus viewer (sees incoming cards), one hidden-able woman who liked him, and the viewer's token. */
async function scenario() {
  const viewer = await createMember(ctx, { gender: 'male', subscription: 'plus', answers: COMPATIBLE_ANSWERS });
  const other = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS, subscription: 'plus' });
  await interest(other.id, viewer.id);
  const token = await login(ctx, viewer.phone);
  return { viewer, other, token };
}

describe('privacy status and pause', () => {
  it('pauses with an end date, hides the account everywhere and resumes', async () => {
    const { other, token } = await scenario();
    const before = await surfaces(token);
    expect([...before.feed, ...before.picks]).toContain(other.id);
    expect(before.incoming).toContain(other.id);

    const otherToken = await login(ctx, other.phone);
    const until = new Date(Date.now() + 7 * DAY).toISOString();
    const paused = await ctx.http.put('/me/pause').set(auth(otherToken)).send({ until }).expect(200);
    expect(paused.body).toMatchObject({ state: 'paused', paused: true, pausedUntil: until });

    const after = await surfaces(token);
    expect(after.feed).not.toContain(other.id);
    expect(after.picks).not.toContain(other.id);
    expect(after.incoming).not.toContain(other.id);
    expect(after.incomingCount).toBe(0);
    await ctx.http.get(`/profiles/${other.id}`).set(auth(token)).expect(404);

    const resumed = await ctx.http.delete('/me/pause').set(auth(otherToken)).expect(200);
    expect(resumed.body).toMatchObject({ state: 'active', paused: false, pausedUntil: null });
    const back = await surfaces(token);
    expect([...back.feed, ...back.picks]).toContain(other.id);
    expect(back.incoming).toContain(other.id);
  });

  it('supports "until I resume" and rejects past or invalid end dates', async () => {
    const m = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, m.phone);
    const res = await ctx.http.put('/me/pause').set(auth(token)).send({ until: null }).expect(200);
    expect(res.body).toMatchObject({ state: 'paused', paused: true, pausedUntil: null });
    await ctx.http.put('/me/pause').set(auth(token)).send({ until: new Date(Date.now() - DAY).toISOString() }).expect(400);
    await ctx.http.put('/me/pause').set(auth(token)).send({ until: 'not-a-date-at-all' }).expect(400);
    await ctx.http.put('/me/pause').set(auth(token)).send({ until: new Date(Date.now() + 400 * DAY).toISOString() }).expect(400);
  });

  it('auto-resumes when paused_until has passed', async () => {
    const { other, token } = await scenario();
    await ctx.db.update(t.accounts).set({ status: 'paused', pausedUntil: new Date(Date.now() - 1000) }).where(eq(t.accounts.id, other.id));
    const s = await surfaces(token);
    expect([...s.feed, ...s.picks]).toContain(other.id);
    const otherToken = await login(ctx, other.phone);
    const status = await ctx.http.get('/me/privacy').set(auth(otherToken)).expect(200);
    expect(status.body).toMatchObject({ state: 'active', paused: false });
    const [row] = await ctx.db.select().from(t.accounts).where(eq(t.accounts.id, other.id));
    expect(row!.status).toBe('active');
  });

  it('keeps existing matches working while paused', async () => {
    const { viewer, other, token } = await scenario();
    const matchId = await match(viewer.id, other.id);
    await ctx.db.update(t.accounts).set({ status: 'paused', pausedUntil: null }).where(eq(t.accounts.id, other.id));
    const matches = await ctx.http.get('/matches').set(auth(token)).expect(200);
    expect(matches.body.map((m: { matchId: string }) => m.matchId)).toContain(matchId);
    await ctx.http.get(`/profiles/${other.id}`).set(auth(token)).expect(200);
    await ctx.http.post(`/matches/${matchId}/messages`).set(auth(token)).send({ kind: 'text', body: 'Assalamu alaikum' }).expect((r) => expect(r.status).toBeLessThan(300));
  });

  it('removes paused members from Passport counts', async () => {
    const viewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const a = await createMember(ctx, { gender: 'female', country: 'AE', city: 'Dubai', answers: COMPATIBLE_ANSWERS });
    await createMember(ctx, { gender: 'female', country: 'AE', city: 'Dubai', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, viewer.phone);
    const count = async () =>
      ((await ctx.http.get('/feed').set(auth(token)).expect(200)).body as FeedBody).passportSuggestions.find((s) => s.country === 'AE')?.compatibleCount ?? 0;
    expect(await count()).toBe(2);
    await ctx.db.update(t.accounts).set({ status: 'paused', pausedUntil: null }).where(eq(t.accounts.id, a.id));
    expect(await count()).toBe(1);
  });
});

describe('incognito', () => {
  it('requires a plan that includes it', async () => {
    const m = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, m.phone);
    const res = await ctx.http.put('/me/incognito').set(auth(token)).send({ on: true }).expect(403);
    expect(res.body.error).toBe('plan_required');
    // Turning it off is always allowed.
    await ctx.http.put('/me/incognito').set(auth(token)).send({ on: false }).expect(200);
  });

  it('shows an incognito member only to people she sent an interest to, and to matches', async () => {
    const liked = await createMember(ctx, { gender: 'male', subscription: 'plus', answers: COMPATIBLE_ANSWERS });
    const stranger = await createMember(ctx, { gender: 'male', subscription: 'plus', answers: COMPATIBLE_ANSWERS });
    const matched = await createMember(ctx, { gender: 'male', subscription: 'plus', answers: COMPATIBLE_ANSWERS });
    const her = await createMember(ctx, { gender: 'female', subscription: 'gold', answers: COMPATIBLE_ANSWERS });
    await interest(her.id, liked.id);
    await match(her.id, matched.id);

    const herToken = await login(ctx, her.phone);
    const on = await ctx.http.put('/me/incognito').set(auth(herToken)).send({ on: true }).expect(200);
    expect(on.body).toMatchObject({ incognito: true, canIncognito: true });

    const strangerToken = await login(ctx, stranger.phone);
    const s = await surfaces(strangerToken);
    expect([...s.feed, ...s.picks]).not.toContain(her.id);
    await ctx.http.get(`/profiles/${her.id}`).set(auth(strangerToken)).expect(404);
    await ctx.http.post('/interests').set(auth(strangerToken)).send({ toId: her.id, level: 'interest' }).expect(404);

    const likedToken = await login(ctx, liked.phone);
    const l = await surfaces(likedToken);
    expect(l.incoming).toContain(her.id);
    await ctx.http.get(`/profiles/${her.id}`).set(auth(likedToken)).expect(200);

    const matchedToken = await login(ctx, matched.phone);
    await ctx.http.get(`/profiles/${her.id}`).set(auth(matchedToken)).expect(200);
    const matches = await ctx.http.get('/matches').set(auth(matchedToken)).expect(200);
    expect(matches.body).toHaveLength(1);

    await ctx.http.put('/me/incognito').set(auth(herToken)).send({ on: false }).expect(200);
    const again = await surfaces(strangerToken);
    expect([...again.feed, ...again.picks]).toContain(her.id);
  });
});

describe('moderation enforcement', () => {
  it('hides suspended and banned members from every surface', async () => {
    const { other, token } = await scenario();
    for (const set of [
      { status: 'suspended', suspendedUntil: new Date(Date.now() + 3 * DAY) },
      { status: 'active', suspendedUntil: new Date(Date.now() + 3 * DAY) },
      { status: 'banned', suspendedUntil: null },
    ]) {
      await ctx.db.update(t.accounts).set(set).where(eq(t.accounts.id, other.id));
      const s = await surfaces(token);
      expect([...s.feed, ...s.picks, ...s.incoming]).not.toContain(other.id);
      await ctx.http.get(`/profiles/${other.id}`).set(auth(token)).expect(404);
    }
    // A suspension that has ended no longer hides the account.
    await ctx.db.update(t.accounts).set({ status: 'suspended', suspendedUntil: new Date(Date.now() - 1000) }).where(eq(t.accounts.id, other.id));
    const s = await surfaces(token);
    expect(s.incoming).toContain(other.id);
  });

  it('answers 403 account_suspended to a suspended account, except for its own status, export and deletion', async () => {
    const m = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, m.phone);
    const until = new Date(Date.now() + 2 * DAY);
    await ctx.db.update(t.accounts).set({ status: 'suspended', suspendedUntil: until }).where(eq(t.accounts.id, m.id));

    const feed = await ctx.http.get('/feed').set(auth(token)).expect(403);
    expect(feed.body).toEqual({ error: 'account_suspended', until: until.toISOString() });
    await ctx.http.get('/matches').set(auth(token)).expect(403);
    await ctx.http.put('/me/pause').set(auth(token)).send({ until: null }).expect(403);

    await ctx.http.get('/me').set(auth(token)).expect(200);
    const status = await ctx.http.get('/me/privacy').set(auth(token)).expect(200);
    expect(status.body).toMatchObject({ state: 'suspended', suspendedUntil: until.toISOString() });
    await ctx.http.get('/me/export').set(auth(token)).expect(200);

    // Once the suspension ends, everything works again.
    await ctx.db.update(t.accounts).set({ suspendedUntil: new Date(Date.now() - 1000) }).where(eq(t.accounts.id, m.id));
    await ctx.http.get('/feed').set(auth(token)).expect(200);
  });

  it('answers 403 account_banned to a banned account', async () => {
    const m = await createMember(ctx, { gender: 'male' });
    const token = await login(ctx, m.phone);
    await ctx.db.update(t.accounts).set({ status: 'banned' }).where(eq(t.accounts.id, m.id));
    const res = await ctx.http.get('/matches').set(auth(token)).expect(403);
    expect(res.body.error).toBe('account_banned');
    await ctx.http.get('/me/privacy').set(auth(token)).expect(200);
    await ctx.http.post('/me/deletion').set(auth(token)).expect(200);
  });
});

describe('account deletion', () => {
  it('hides the account at once, restricts its API calls, and can be cancelled within the grace period', async () => {
    const { other, token } = await scenario();
    const otherToken = await login(ctx, other.phone);
    const req = await ctx.http.post('/me/deletion').set(auth(otherToken)).expect(200);
    expect(req.body.state).toBe('deletion_pending');
    expect(req.body.graceDays).toBe(30);
    const scheduled = new Date(req.body.deletionScheduledFor).getTime() - new Date(req.body.deletionRequestedAt).getTime();
    expect(scheduled).toBe(30 * DAY);

    const s = await surfaces(token);
    expect([...s.feed, ...s.picks, ...s.incoming]).not.toContain(other.id);
    await ctx.http.get(`/profiles/${other.id}`).set(auth(token)).expect(404);

    // Signed out of everything but the status, export and cancellation.
    const blocked = await ctx.http.get('/feed').set(auth(otherToken)).expect(403);
    expect(blocked.body.error).toBe('deletion_pending');
    await ctx.http.get('/me').set(auth(otherToken)).expect(200);

    // Signing in again (OTP) still works so the request can be cancelled.
    const again = await login(ctx, other.phone);
    const cancelled = await ctx.http.delete('/me/deletion').set(auth(again)).expect(200);
    expect(cancelled.body).toMatchObject({ state: 'active', deletionRequestedAt: null });
    const back = await surfaces(token);
    expect(back.incoming).toContain(other.id);

    const notes = await ctx.db.select().from(t.notifications).where(eq(t.notifications.accountId, other.id));
    expect(notes.map((n) => n.kind).sort()).toEqual(['account_deletion_cancelled', 'account_deletion_scheduled']);
  });

  it('hides a deletion-pending match from conversations', async () => {
    const { viewer, other, token } = await scenario();
    await match(viewer.id, other.id);
    await ctx.db.update(t.accounts).set({ deletionRequestedAt: new Date() }).where(eq(t.accounts.id, other.id));
    const matches = await ctx.http.get('/matches').set(auth(token)).expect(200);
    expect(matches.body).toHaveLength(0);
  });

  it('refuses cancellation after the grace period', async () => {
    const m = await createMember(ctx, { gender: 'male' });
    const token = await login(ctx, m.phone);
    await ctx.db.update(t.accounts).set({ deletionRequestedAt: new Date(Date.now() - 31 * DAY) }).where(eq(t.accounts.id, m.id));
    const res = await ctx.http.delete('/me/deletion').set(auth(token)).expect(409);
    expect(res.body.error).toBe('grace_period_over');
  });

  it('purges accounts past the grace period and signs them out', async () => {
    const { viewer, other, token } = await scenario();
    const recent = await createMember(ctx, { gender: 'female' });
    const matchId = await match(viewer.id, other.id);
    await ctx.db.insert(t.messages).values({ id: uuidv7(), matchId, senderId: other.id, kind: 'text', body: 'Hello' });
    await ctx.db.insert(t.passes).values({ fromId: other.id, toId: viewer.id });
    await ctx.db.insert(t.blocks).values({ blockerId: other.id, blockedId: recent.id });
    await ctx.db.insert(t.reports).values({ id: uuidv7(), reporterId: viewer.id, subjectId: other.id, category: 'other' });
    const otherToken = await login(ctx, other.phone);
    await ctx.db.update(t.accounts).set({ deletionRequestedAt: new Date(Date.now() - 31 * DAY) }).where(eq(t.accounts.id, other.id));
    await ctx.db.update(t.accounts).set({ deletionRequestedAt: new Date(Date.now() - 5 * DAY) }).where(eq(t.accounts.id, recent.id));

    const erased = await purgeExpiredDeletions(ctx.db, new Date(), 30);
    expect(erased).toEqual([other.id]);

    expect(await ctx.db.select().from(t.accounts).where(eq(t.accounts.id, other.id))).toHaveLength(0);
    expect(await ctx.db.select().from(t.profiles).where(eq(t.profiles.accountId, other.id))).toHaveLength(0);
    expect(await ctx.db.select().from(t.interests).where(eq(t.interests.fromId, other.id))).toHaveLength(0);
    expect(await ctx.db.select().from(t.matches).where(eq(t.matches.id, matchId))).toHaveLength(0);
    expect(await ctx.db.select().from(t.passes).where(eq(t.passes.fromId, other.id))).toHaveLength(0);
    expect(await ctx.db.select().from(t.blocks).where(eq(t.blocks.blockerId, other.id))).toHaveLength(0);
    // Reports about the erased account are retained for safety.
    expect(await ctx.db.select().from(t.reports).where(eq(t.reports.subjectId, other.id))).toHaveLength(1);
    // The account inside its grace period is untouched.
    expect(await ctx.db.select().from(t.accounts).where(eq(t.accounts.id, recent.id))).toHaveLength(1);

    await ctx.http.get('/me').set(auth(otherToken)).expect(401);
    await ctx.http.get('/matches').set(auth(token)).expect(200);
  });
});

describe('data export', () => {
  it('returns everything the account owns as an attachment, without other members’ private data', async () => {
    const { viewer, other, token } = await scenario();
    await interest(viewer.id, other.id, 'matched');
    const matchId = await match(viewer.id, other.id);
    await ctx.db.insert(t.messages).values([
      { id: uuidv7(), matchId, senderId: viewer.id, kind: 'text', body: 'My message' },
      { id: uuidv7(), matchId, senderId: other.id, kind: 'text', body: 'Their private message' },
    ]);
    await ctx.db.insert(t.reports).values({ id: uuidv7(), reporterId: viewer.id, subjectId: other.id, category: 'other', details: 'note' });
    await ctx.http.put('/me/consents/religious_data').set(auth(token)).send({ granted: true }).expect(200);

    const res = await ctx.http.get('/me/export').set(auth(token)).expect(200);
    expect(res.headers['content-disposition']).toMatch(/^attachment; filename="halal-meet-export-\d{4}-\d{2}-\d{2}\.json"$/);
    const body = res.body;
    expect(body.format).toBe('halal-meet-export');
    expect(body.account.id).toBe(viewer.id);
    expect(body.profile.firstName).toBe('Ahmed');
    expect(body.answers.length).toBeGreaterThan(0);
    expect(body.preferences.ageMin).toBe(18);
    expect(body.interestsSent).toEqual([expect.objectContaining({ toId: other.id, toFirstName: 'Sara' })]);
    expect(body.matches).toHaveLength(1);
    expect(body.matches[0].otherFirstName).toBe('Sara');
    expect(body.matches[0].myMessages.map((m: { body: string }) => m.body)).toEqual(['My message']);
    expect(body.reportsFiled).toHaveLength(1);
    expect(body.consents).toEqual([expect.objectContaining({ kind: 'religious_data', granted: true })]);
    const text = JSON.stringify(body);
    expect(text).not.toContain('Their private message');
    expect(text).not.toContain(other.phone);
  });
});

describe('consents', () => {
  it('records and updates consents, and refuses to withdraw required ones', async () => {
    const m = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, m.phone);
    expect((await ctx.http.get('/me/consents').set(auth(token)).expect(200)).body).toEqual([]);
    await ctx.http.put('/me/consents/terms').set(auth(token)).send({ granted: true }).expect(200);
    await ctx.http.put('/me/consents/privacy').set(auth(token)).send({ granted: true }).expect(200);
    await ctx.http.put('/me/consents/religious_data').set(auth(token)).send({ granted: true }).expect(200);
    const list = await ctx.http.put('/me/consents/religious_data').set(auth(token)).send({ granted: false }).expect(200);
    expect(list.body.find((c: { kind: string }) => c.kind === 'religious_data').granted).toBe(false);
    expect(list.body).toHaveLength(3);
    await ctx.http.put('/me/consents/terms').set(auth(token)).send({ granted: false }).expect(400);
    await ctx.http.put('/me/consents/nonsense').set(auth(token)).send({ granted: true }).expect(400);
  });
});

describe('loose-end reads', () => {
  it('GET /me/preferences returns saved preferences, or defaults when none exist', async () => {
    const m = await createMember(ctx, { gender: 'female', age: 30, preferences: { ageMin: 27, ageMax: 36 } });
    const token = await login(ctx, m.phone);
    const saved = await ctx.http.get('/me/preferences').set(auth(token)).expect(200);
    expect(saved.body).toMatchObject({ saved: true, preferences: { ageMin: 27, ageMax: 36, dimensionImportance: {} } });

    await ctx.db.delete(t.matchPreferences).where(eq(t.matchPreferences.accountId, m.id));
    const defaults = await ctx.http.get('/me/preferences').set(auth(token)).expect(200);
    expect(defaults.body).toMatchObject({ saved: false, preferences: { ageMin: 22, ageMax: 38, verifiedOnly: true } });
  });

  it('lists blocked members with first names and unblocks them', async () => {
    const viewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const her = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, viewer.phone);
    await ctx.http.post('/blocks').set(auth(token)).send({ subjectId: her.id }).expect(200);
    const list = await ctx.http.get('/blocks').set(auth(token)).expect(200);
    expect(list.body).toEqual([expect.objectContaining({ subjectId: her.id, firstName: 'Sara' })]);
    expect(feedIds((await ctx.http.get('/feed').set(auth(token)).expect(200)).body)).not.toContain(her.id);

    await ctx.http.delete(`/blocks/${her.id}`).set(auth(token)).expect(200);
    expect((await ctx.http.get('/blocks').set(auth(token)).expect(200)).body).toEqual([]);
    const s = await surfaces(token);
    expect([...s.feed, ...s.picks]).toContain(her.id);
  });

  it('lists the profiles shared with guardians', async () => {
    const viewer = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const him = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, viewer.phone);
    await ctx.http.post('/guardians/shares').set(auth(token)).send({ subjectId: him.id }).expect(200);
    const shares = await ctx.http.get('/guardians/shares').set(auth(token)).expect(200);
    expect(shares.body).toEqual([expect.objectContaining({ subjectId: him.id, firstName: 'Ahmed' })]);
    await ctx.http.delete(`/guardians/shares/${him.id}`).set(auth(token)).expect(200);
    expect((await ctx.http.get('/guardians/shares').set(auth(token)).expect(200)).body).toEqual([]);
  });
});
