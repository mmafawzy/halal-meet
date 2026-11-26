import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import * as t from '../src/db/schema';
import { uuidv7 } from '../src/common/ids';
import { createMember, createTestApp, login, truncateAll, type TestContext } from './helpers';

let ctx: TestContext;

beforeAll(async () => {
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await truncateAll(ctx.db);
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

async function staff(role: 'moderator' | 'admin' = 'moderator') {
  const m = await createMember(ctx, { gender: 'female' });
  await ctx.db.update(t.accounts).set({ role }).where(eq(t.accounts.id, m.id));
  return { ...m, token: await login(ctx, m.phone) };
}

/** Sara reports Omar for a scam, citing one of his messages in their conversation. */
async function scenario(opts: { cite?: boolean; category?: string } = {}) {
  const sara = await createMember(ctx, { gender: 'female' });
  const omar = await createMember(ctx, { gender: 'male' });
  const other = await createMember(ctx, { gender: 'female' });
  const matchId = uuidv7();
  await ctx.db.insert(t.matches).values({ id: matchId, aId: sara.id, bId: omar.id, stage: 2 });
  const otherMatchId = uuidv7();
  await ctx.db.insert(t.matches).values({ id: otherMatchId, aId: other.id, bId: omar.id, stage: 1 });
  const base = Date.now() - 3_600_000;
  const ids: string[] = [];
  const bodies: Array<[string, string, string | null]> = [
    [sara.id, 'Assalamu alaikum', null],
    [omar.id, 'Wa alaikum assalam', null],
    [sara.id, 'How is your week?', null],
    [omar.id, 'Good. Could you send me money for my visa fee?', 'money'],
    [sara.id, 'No, sorry.', null],
    [omar.id, 'Message me on WhatsApp then', 'off_platform'],
    [sara.id, 'I prefer to stay here.', null],
    [omar.id, 'ok', null],
    [sara.id, 'Take care', null],
    [omar.id, 'bye', null],
  ];
  for (const [i, [sender, body, risk]] of bodies.entries()) {
    const id = uuidv7(base + i * 1000);
    ids.push(id);
    await ctx.db.insert(t.messages).values({ id, matchId, senderId: sender, kind: 'text', body, risk, sentAt: new Date(base + i * 1000) });
  }
  const saraToken = await login(ctx, sara.phone);
  await ctx.http
    .post('/reports')
    .set(auth(saraToken))
    .send({ subjectId: omar.id, category: opts.category ?? 'scam', details: 'Asked for money', ...(opts.cite === false ? {} : { messageIds: [ids[3]] }) })
    .expect(200);
  const [report] = await ctx.db.select().from(t.reports);
  return { sara, omar, other, matchId, otherMatchId, ids, saraToken, reportId: report!.id };
}

async function notificationsFor(accountId: string) {
  return ctx.db.select().from(t.notifications).where(eq(t.notifications.accountId, accountId));
}

describe('moderation: access', () => {
  it('rejects members (403) and unauthenticated callers (401); exposes the role on GET /me', async () => {
    const member = await createMember(ctx, { gender: 'male' });
    const token = await login(ctx, member.phone);
    for (const path of ['/admin/reports', '/admin/stats', '/admin/audit', '/admin/photos']) {
      const res = await ctx.http.get(path).set(auth(token)).expect(403);
      expect(res.body.error).toBe('forbidden');
      await ctx.http.get(path).expect(401);
    }
    await ctx.http.post(`/admin/reports/${uuidv7()}/resolve`).set(auth(token)).send({ action: 'dismiss', reason: 'nothing' }).expect(403);
    const me = await ctx.http.get('/me').set(auth(token)).expect(200);
    expect(me.body.role).toBe('member');

    const mod = await staff();
    await ctx.http.get('/admin/reports').set(auth(mod.token)).expect(200);
    expect((await ctx.http.get('/me').set(auth(mod.token)).expect(200)).body.role).toBe('moderator');
    const admin = await staff('admin');
    await ctx.http.get('/admin/stats').set(auth(admin.token)).expect(200);
  });
});

describe('moderation: report queue', () => {
  it('lists open reports with summaries, priority, risk flags and evidence with context', async () => {
    const s = await scenario();
    const mod = await staff();
    const list = await ctx.http.get('/admin/reports?status=open').set(auth(mod.token)).expect(200);
    expect(list.body).toHaveLength(1);
    const item = list.body[0];
    expect(item).toMatchObject({ id: s.reportId, status: 'open', category: 'scam', priority: 'p1', evidenceCount: 1, priorReportCount: 0 });
    expect(item.reporter).toMatchObject({ id: s.sara.id, firstName: 'Sara', status: 'active' });
    expect(item.subject).toMatchObject({ id: s.omar.id, firstName: 'Ahmed', role: 'member' });
    expect(item.riskFlags).toEqual(['money', 'off_platform']);

    const detail = await ctx.http.get(`/admin/reports/${s.reportId}`).set(auth(mod.token)).expect(200);
    // Cited message index 3 plus 3 either side → indices 0..6.
    expect(detail.body.evidence.map((e: { id: string }) => e.id)).toEqual(s.ids.slice(0, 7));
    const cited = detail.body.evidence.find((e: { reported: boolean }) => e.reported);
    expect(cited).toMatchObject({ id: s.ids[3], author: 'subject', risk: 'money', hidden: false });
    expect(detail.body.evidence[0].author).toBe('reporter');
    expect(detail.body.subjectReports).toEqual([]);
    expect(detail.body.subjectActions).toEqual([]);

    expect((await ctx.http.get('/admin/reports?status=actioned').set(auth(mod.token)).expect(200)).body).toEqual([]);
    expect((await ctx.http.get('/admin/reports?category=harassment').set(auth(mod.token)).expect(200)).body).toEqual([]);
    await ctx.http.get('/admin/reports?status=weird').set(auth(mod.token)).expect(400);
    await ctx.http.get(`/admin/reports/${uuidv7()}`).set(auth(mod.token)).expect(404);
  });

  it('falls back to the tail of the conversation when no message was cited; sorts p0 first', async () => {
    const s = await scenario({ cite: false });
    const kid = await createMember(ctx, { gender: 'female' });
    const kidToken = await login(ctx, kid.phone);
    await ctx.http.post('/reports').set(auth(kidToken)).send({ subjectId: s.omar.id, category: 'underage' }).expect(200);
    const mod = await staff();
    const list = await ctx.http.get('/admin/reports').set(auth(mod.token)).expect(200);
    expect(list.body.map((r: { priority: string }) => r.priority)).toEqual(['p0', 'p1']);
    expect(list.body[0].priorReportCount).toBe(1);
    const detail = await ctx.http.get(`/admin/reports/${s.reportId}`).set(auth(mod.token)).expect(200);
    expect(detail.body.evidence.map((e: { id: string }) => e.id)).toEqual(s.ids.slice(2));
    expect(detail.body.evidence.every((e: { reported: boolean }) => !e.reported)).toBe(true);
    expect(detail.body.subjectReports).toHaveLength(1);
  });
});

describe('moderation: resolving reports', () => {
  it('dismiss closes the report and tells the reporter only that it was reviewed', async () => {
    const s = await scenario();
    const mod = await staff();
    const res = await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'dismiss', reason: 'Not a violation' }).expect(200);
    expect(res.body).toMatchObject({ status: 'dismissed', resolvedBy: mod.id });
    expect(res.body.resolvedAt).toBeTruthy();
    const [report] = await ctx.db.select().from(t.reports);
    expect(report).toMatchObject({ status: 'dismissed', resolvedBy: mod.id });
    expect((await notificationsFor(s.omar.id))).toHaveLength(0);
    const toReporter = await notificationsFor(s.sara.id);
    expect(toReporter).toHaveLength(1);
    expect(toReporter[0]).toMatchObject({ kind: 'moderation', payload: { type: 'report_reviewed', reportId: s.reportId } });
    // Already resolved.
    const again = await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'warn', reason: 'second try' }).expect(409);
    expect(again.body.error).toBe('report_closed');
  });

  it('warn records the action and sends the subject a neutral warning', async () => {
    const s = await scenario();
    const mod = await staff();
    const res = await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'warn', reason: 'First money request' }).expect(200);
    expect(res.body.status).toBe('actioned');
    expect(res.body.subjectActions).toHaveLength(1);
    expect(res.body.subjectActions[0]).toMatchObject({ action: 'warn', reason: 'First money request', reportId: s.reportId, moderator: { id: mod.id } });
    const [account] = await ctx.db.select().from(t.accounts).where(eq(t.accounts.id, s.omar.id));
    expect(account!.status).toBe('active');
    const notes = await notificationsFor(s.omar.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.payload).toEqual({ type: 'warning' });
    expect(JSON.stringify(notes[0]!.payload)).not.toContain(s.sara.id);
    expect((await notificationsFor(s.sara.id))[0]!.payload).toMatchObject({ type: 'report_reviewed' });
  });

  it('hide_message hides one of the subject’s messages (and refuses other people’s)', async () => {
    const s = await scenario();
    const mod = await staff();
    await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'hide_message', reason: 'Money' }).expect(400);
    const notHis = await ctx.http
      .post(`/admin/reports/${s.reportId}/resolve`)
      .set(auth(mod.token))
      .send({ action: 'hide_message', reason: 'Money', messageId: s.ids[0] })
      .expect(400);
    expect(notHis.body.error).toBe('message_not_from_subject');
    const res = await ctx.http
      .post(`/admin/reports/${s.reportId}/resolve`)
      .set(auth(mod.token))
      .send({ action: 'hide_message', reason: 'Money', messageId: s.ids[3] })
      .expect(200);
    expect(res.body.evidence.find((e: { id: string }) => e.id === s.ids[3]).hidden).toBe(true);
    const [msg] = await ctx.db.select().from(t.messages).where(eq(t.messages.id, s.ids[3]!));
    expect(msg!.hidden).toBe(true);
    const [action] = await ctx.db.select().from(t.moderationActions);
    expect(action).toMatchObject({ action: 'hide_message', subjectId: s.omar.id, moderatorId: mod.id });
    expect(action!.meta).toMatchObject({ messageId: s.ids[3], matchId: s.matchId });
    expect((await notificationsFor(s.omar.id))[0]!.payload).toEqual({ type: 'message_removed', messageId: s.ids[3] });
  });

  it('suspend sets the status and end date; days are required', async () => {
    const s = await scenario();
    const mod = await staff();
    const missing = await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'suspend', reason: 'Scam' }).expect(400);
    expect(missing.body.error).toBe('days_required');
    await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'suspend', reason: 'Scam', days: 999 }).expect(400);
    const before = Date.now();
    await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'suspend', reason: 'Scam', days: 7 }).expect(200);
    const [account] = await ctx.db.select().from(t.accounts).where(eq(t.accounts.id, s.omar.id));
    expect(account!.status).toBe('suspended');
    const until = account!.suspendedUntil!.getTime();
    expect(until).toBeGreaterThanOrEqual(before + 7 * 86_400_000 - 1000);
    expect(until).toBeLessThanOrEqual(Date.now() + 7 * 86_400_000 + 1000);
    const note = (await notificationsFor(s.omar.id))[0]!;
    expect(note.payload).toEqual({ type: 'suspended', until: account!.suspendedUntil!.toISOString() });
    // Matches stay open during a suspension.
    const [match] = await ctx.db.select().from(t.matches).where(eq(t.matches.id, s.matchId));
    expect(match!.status).toBe('active');
  });

  it('ban sets the status and closes every active match of the subject', async () => {
    const s = await scenario();
    const mod = await staff();
    const res = await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'ban', reason: 'Confirmed scam' }).expect(200);
    expect(res.body.subject.status).toBe('banned');
    const [account] = await ctx.db.select().from(t.accounts).where(eq(t.accounts.id, s.omar.id));
    expect(account).toMatchObject({ status: 'banned', suspendedUntil: null });
    const matches = await ctx.db.select().from(t.matches);
    expect(matches.every((m) => m.status === 'closed' && m.closeReason === 'moderation')).toBe(true);
    expect(res.body.subjectActions[0].meta).toMatchObject({ closedMatches: 2 });
    expect((await notificationsFor(s.omar.id))[0]!.payload).toEqual({ type: 'banned' });
  });

  it('protects staff accounts and self', async () => {
    const mod = await staff();
    const admin = await staff('admin');
    const reporter = await createMember(ctx, { gender: 'male' });
    const token = await login(ctx, reporter.phone);
    await ctx.http.post('/reports').set(auth(token)).send({ subjectId: admin.id, category: 'other' }).expect(200);
    await ctx.http.post('/reports').set(auth(token)).send({ subjectId: mod.id, category: 'other' }).expect(200);
    const reports = await ctx.db.select().from(t.reports);
    const aboutAdmin = reports.find((r) => r.subjectId === admin.id)!;
    const aboutMod = reports.find((r) => r.subjectId === mod.id)!;
    const staffRes = await ctx.http.post(`/admin/reports/${aboutAdmin.id}/resolve`).set(auth(mod.token)).send({ action: 'warn', reason: 'test' }).expect(403);
    expect(staffRes.body.error).toBe('staff_account');
    const selfRes = await ctx.http.post(`/admin/reports/${aboutMod.id}/resolve`).set(auth(mod.token)).send({ action: 'dismiss', reason: 'test' }).expect(400);
    expect(selfRes.body.error).toBe('cannot_moderate_self');
    await ctx.http.post(`/admin/reports/${aboutMod.id}/resolve`).set(auth(admin.token)).send({ action: 'warn', reason: 'Admins can' }).expect(200);
  });
});

describe('moderation: accounts', () => {
  it('reinstates suspended or banned accounts and shows the account history', async () => {
    const s = await scenario();
    const mod = await staff();
    const notRestricted = await ctx.http.post(`/admin/accounts/${s.omar.id}/reinstate`).set(auth(mod.token)).send({ reason: 'Appeal accepted' }).expect(409);
    expect(notRestricted.body.error).toBe('not_restricted');
    await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'suspend', reason: 'Scam', days: 3 }).expect(200);
    await ctx.http.post(`/admin/accounts/${s.omar.id}/reinstate`).set(auth(mod.token)).send({}).expect(400);
    const res = await ctx.http.post(`/admin/accounts/${s.omar.id}/reinstate`).set(auth(mod.token)).send({ reason: 'Appeal accepted' }).expect(200);
    expect(res.body.account).toMatchObject({ id: s.omar.id, status: 'active', suspendedUntil: null });
    expect(res.body.actions.map((a: { action: string }) => a.action)).toEqual(['reinstate', 'suspend']);
    expect(res.body.reportsAgainst).toHaveLength(1);
    expect(res.body.reportsBy).toHaveLength(0);
    expect(res.body.account.phoneMasked).not.toContain(s.omar.phone.slice(5, 10));
    expect(res.body.verifications.map((v: { kind: string }) => v.kind).sort()).toEqual(['identity', 'phone']);
    expect(res.body.activeMatches).toBe(2);
    const notes = await notificationsFor(s.omar.id);
    expect(notes.map((n) => (n.payload as { type: string }).type).sort()).toEqual(['reinstated', 'suspended']);

    const sara = await ctx.http.get(`/admin/accounts/${s.sara.id}`).set(auth(mod.token)).expect(200);
    expect(sara.body.reportsBy).toHaveLength(1);
    await ctx.http.get(`/admin/accounts/${uuidv7()}`).set(auth(mod.token)).expect(404);
  });
});

describe('moderation: photos', () => {
  async function photo(accountId: string, status = 'pending') {
    const id = uuidv7();
    await ctx.db.insert(t.photos).values({ id, accountId, storageKey: `photos/${id}.jpg`, mime: 'image/jpeg', bytes: 1000, width: 800, height: 1000, status });
    return id;
  }

  it('lists pending photos and records approve / reject decisions', async () => {
    const owner = await createMember(ctx, { gender: 'female' });
    const p1 = await photo(owner.id);
    const p2 = await photo(owner.id);
    await photo(owner.id, 'approved');
    const mod = await staff();
    const list = await ctx.http.get('/admin/photos?status=pending').set(auth(mod.token)).expect(200);
    expect(list.body.map((p: { id: string }) => p.id).sort()).toEqual([p1, p2].sort());
    expect(list.body[0].owner).toMatchObject({ id: owner.id, firstName: 'Sara' });

    const ok = await ctx.http.post(`/admin/photos/${p1}`).set(auth(mod.token)).send({ decision: 'approve' }).expect(200);
    expect(ok.body.status).toBe('approved');
    const noReason = await ctx.http.post(`/admin/photos/${p2}`).set(auth(mod.token)).send({ decision: 'reject' }).expect(400);
    expect(noReason.body.error).toBe('reason_required');
    await ctx.http.post(`/admin/photos/${p2}`).set(auth(mod.token)).send({ decision: 'reject', reason: 'Not a photo of a person' }).expect(200);
    await ctx.http.post(`/admin/photos/${uuidv7()}`).set(auth(mod.token)).send({ decision: 'approve' }).expect(404);

    const rows = await ctx.db.select().from(t.photos);
    expect(rows.find((r) => r.id === p1)!.status).toBe('approved');
    expect(rows.find((r) => r.id === p2)!.status).toBe('rejected');
    expect((await ctx.http.get('/admin/photos').set(auth(mod.token)).expect(200)).body).toEqual([]);
    expect((await ctx.http.get('/admin/photos?status=rejected').set(auth(mod.token)).expect(200)).body).toHaveLength(1);
    const actions = await ctx.db.select().from(t.moderationActions);
    expect(actions.map((a) => a.action).sort()).toEqual(['approve_photo', 'reject_photo']);
    const notes = await notificationsFor(owner.id);
    expect(notes).toHaveLength(1);
    expect(notes[0]!.payload).toEqual({ type: 'photo_not_approved', photoId: p2 });
  });
});

describe('moderation: audit log and stats', () => {
  it('lists actions newest first, filters by moderator / subject / action and pages with a cursor', async () => {
    const s = await scenario();
    const mod = await staff();
    const admin = await staff('admin');
    const p = uuidv7();
    await ctx.db.insert(t.photos).values({ id: p, accountId: s.other.id, storageKey: 'k', mime: 'image/jpeg', bytes: 1 });
    await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'suspend', reason: 'Scam', days: 1 }).expect(200);
    await ctx.http.post(`/admin/photos/${p}`).set(auth(admin.token)).send({ decision: 'approve' }).expect(200);
    await ctx.http.post(`/admin/accounts/${s.omar.id}/reinstate`).set(auth(admin.token)).send({ reason: 'Appeal' }).expect(200);

    const all = await ctx.http.get('/admin/audit').set(auth(mod.token)).expect(200);
    expect(all.body.entries.map((e: { action: string }) => e.action)).toEqual(['reinstate', 'approve_photo', 'suspend']);
    expect(all.body.entries[2]).toMatchObject({ moderator: { id: mod.id, role: 'moderator' }, subject: { id: s.omar.id, status: 'active' }, reportId: s.reportId });
    expect(all.body.nextCursor).toBeNull();

    const byMod = await ctx.http.get(`/admin/audit?moderatorId=${mod.id}`).set(auth(mod.token)).expect(200);
    expect(byMod.body.entries).toHaveLength(1);
    const bySubject = await ctx.http.get(`/admin/audit?subjectId=${s.omar.id}`).set(auth(mod.token)).expect(200);
    expect(bySubject.body.entries.map((e: { action: string }) => e.action)).toEqual(['reinstate', 'suspend']);
    const byAction = await ctx.http.get('/admin/audit?action=approve_photo').set(auth(mod.token)).expect(200);
    expect(byAction.body.entries).toHaveLength(1);

    const page1 = await ctx.http.get('/admin/audit?limit=2').set(auth(mod.token)).expect(200);
    expect(page1.body.entries).toHaveLength(2);
    expect(page1.body.nextCursor).toBeTruthy();
    const page2 = await ctx.http.get(`/admin/audit?limit=2&before=${encodeURIComponent(page1.body.nextCursor)}`).set(auth(mod.token)).expect(200);
    expect(page2.body.entries.map((e: { action: string }) => e.action)).toEqual(['suspend']);
  });

  it('counts open reports by priority, pending photos and recent actions', async () => {
    const s = await scenario();
    const mod = await staff();
    await ctx.db.insert(t.photos).values({ id: uuidv7(), accountId: s.other.id, storageKey: 'k', mime: 'image/jpeg', bytes: 1 });
    const before = await ctx.http.get('/admin/stats').set(auth(mod.token)).expect(200);
    expect(before.body).toMatchObject({ openReports: 1, openByPriority: { p0: 0, p1: 1, p2: 0 }, pendingPhotos: 1, actionsLast7Days: 0, suspendedAccounts: 0, bannedAccounts: 0 });
    await ctx.http.post(`/admin/reports/${s.reportId}/resolve`).set(auth(mod.token)).send({ action: 'ban', reason: 'Scam' }).expect(200);
    const after = await ctx.http.get('/admin/stats').set(auth(mod.token)).expect(200);
    expect(after.body).toMatchObject({ openReports: 0, actionsLast7Days: 1, actionsByKind: { ban: 1 }, bannedAccounts: 1 });
  });
});
