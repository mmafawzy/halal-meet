import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { defaultGuardianPermissions, type GuardianPermissions } from '@halal-meet/core';
import * as t from '../src/db/schema';
import { uuidv7 } from '../src/common/ids';
import { COMPATIBLE_ANSWERS } from './fixtures';
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
const NONE: GuardianPermissions = {
  see_matches: false,
  see_reports: false,
  read_conversations: false,
  participate: false,
  join_calls: false,
  approve_stages: false,
  contact_family: false,
  safety_alerts: false,
};

async function match(aId: string, bId: string, stage = 1, status: 'active' | 'closed' = 'active') {
  const id = uuidv7();
  await ctx.db.insert(t.matches).values({ id, aId, bId, stage, status });
  return id;
}

/** A member (Sara) with one active match, plus a guardian who has accepted her invitation. */
async function setup(permissions: GuardianPermissions = defaultGuardianPermissions('wali')) {
  const sara = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
  const ahmed = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
  const matchId = await match(sara.id, ahmed.id, 4);
  const saraToken = await login(ctx, sara.phone);
  const invite = await ctx.http.post('/guardians').set(auth(saraToken)).send({ name: 'Baba', relationship: 'father', permissions }).expect(201);
  const fatherPhone = '+201099000001';
  const fatherToken = await login(ctx, fatherPhone); // a fresh account with no member profile
  const link = await ctx.http.post(`/guardian-invites/${invite.body.inviteCode}/accept`).set(auth(fatherToken)).expect(200);
  return { sara, ahmed, matchId, saraToken, fatherToken, guardianId: invite.body.guardian.id as string, code: invite.body.inviteCode as string, link: link.body };
}

describe('guardians: member side', () => {
  it('invites a guardian, returns the code once and stores only its hash', async () => {
    const sara = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, sara.phone);
    const perms = defaultGuardianPermissions('guided');
    const res = await ctx.http.post('/guardians').set(auth(token)).send({ name: '  Mama ', relationship: 'mother', permissions: perms }).expect(201);
    expect(res.body.inviteCode).toMatch(/^[A-Za-z0-9_-]{20,}$/);
    expect(res.body.guardian).toMatchObject({ name: 'Mama', relationship: 'mother', status: 'invited', accepted: false, permissions: perms });

    const [row] = await ctx.db.select().from(t.guardianships);
    expect(row!.inviteTokenHash).not.toBe(res.body.inviteCode);
    expect(row!.inviteTokenHash).toHaveLength(64);

    const list = await ctx.http.get('/guardians').set(auth(token)).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].inviteCode).toBeUndefined();
  });

  it('validates the body and caps the number of guardians', async () => {
    const sara = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, sara.phone);
    await ctx.http.post('/guardians').set(auth(token)).send({ name: 'X', relationship: 'cousin', permissions: NONE }).expect(400);
    await ctx.http.post('/guardians').set(auth(token)).send({ name: 'X', relationship: 'father', permissions: { see_matches: true } }).expect(400);
    for (let i = 0; i < 5; i++) await ctx.http.post('/guardians').set(auth(token)).send({ name: `G${i}`, relationship: 'other', permissions: NONE }).expect(201);
    const over = await ctx.http.post('/guardians').set(auth(token)).send({ name: 'G6', relationship: 'other', permissions: NONE }).expect(409);
    expect(over.body.error).toBe('guardian_limit');
  });

  it('pauses and resumes: an accepted guardian returns to active, an unaccepted one to invited', async () => {
    const { saraToken, guardianId } = await setup();
    const paused = await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ paused: true }).expect(200);
    expect(paused.body.status).toBe('paused');
    const resumed = await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ paused: false }).expect(200);
    expect(resumed.body.status).toBe('active');

    const pending = await ctx.http.post('/guardians').set(auth(saraToken)).send({ name: 'Uncle', relationship: 'uncle', permissions: NONE }).expect(201);
    await ctx.http.patch(`/guardians/${pending.body.guardian.id}`).set(auth(saraToken)).send({ paused: true }).expect(200);
    const back = await ctx.http.patch(`/guardians/${pending.body.guardian.id}`).set(auth(saraToken)).send({ paused: false }).expect(200);
    expect(back.body.status).toBe('invited');

    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({}).expect(400);
  });

  it("only lets the member touch their own guardians", async () => {
    const { guardianId } = await setup();
    const other = await createMember(ctx, { gender: 'female' });
    const otherToken = await login(ctx, other.phone);
    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(otherToken)).send({ paused: true }).expect(404);
    await ctx.http.delete(`/guardians/${guardianId}`).set(auth(otherToken)).expect(404);
  });

  it('re-issuing an invitation invalidates the old code, and is refused once accepted', async () => {
    const sara = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, sara.phone);
    const first = await ctx.http.post('/guardians').set(auth(token)).send({ name: 'Baba', relationship: 'father', permissions: NONE }).expect(201);
    const second = await ctx.http.post(`/guardians/${first.body.guardian.id}/invite`).set(auth(token)).expect(200);
    expect(second.body.inviteCode).not.toBe(first.body.inviteCode);
    await ctx.http.get(`/guardian-invites/${first.body.inviteCode}`).expect(404);
    await ctx.http.get(`/guardian-invites/${second.body.inviteCode}`).expect(200);

    const fatherToken = await login(ctx, '+201099000002');
    await ctx.http.post(`/guardian-invites/${second.body.inviteCode}/accept`).set(auth(fatherToken)).expect(200);
    await ctx.http.post(`/guardians/${first.body.guardian.id}/invite`).set(auth(token)).expect(409);
  });
});

describe('guardians: invitations', () => {
  it('shows a public preview with the first name only, then accepts once', async () => {
    const sara = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, sara.phone);
    const perms = defaultGuardianPermissions('wali');
    const inv = await ctx.http.post('/guardians').set(auth(token)).send({ name: 'Baba', relationship: 'father', permissions: perms }).expect(201);

    const preview = await ctx.http.get(`/guardian-invites/${inv.body.inviteCode}`).expect(200); // no token
    expect(preview.body).toEqual({ memberFirstName: 'Sara', memberGender: 'female', relationship: 'father', permissions: perms });

    const fatherToken = await login(ctx, '+201099000003');
    const link = await ctx.http.post(`/guardian-invites/${inv.body.inviteCode}/accept`).set(auth(fatherToken)).expect(200);
    expect(link.body).toMatchObject({ memberId: sara.id, memberFirstName: 'Sara', status: 'active', relationship: 'father' });

    const someoneElse = await login(ctx, '+201099000004');
    await ctx.http.post(`/guardian-invites/${inv.body.inviteCode}/accept`).set(auth(someoneElse)).expect(404); // code is consumed
    await ctx.http.get(`/guardian-invites/${inv.body.inviteCode}`).expect(404);

    const list = await ctx.http.get('/guardians').set(auth(token)).expect(200);
    expect(list.body[0]).toMatchObject({ status: 'active', accepted: true });
    expect(list.body[0].acceptedAt).toBeTruthy();
  });

  it('refuses to let a member guard themselves, or the same guardian twice', async () => {
    const sara = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, sara.phone);
    const inv = await ctx.http.post('/guardians').set(auth(token)).send({ name: 'Me', relationship: 'other', permissions: NONE }).expect(201);
    const self = await ctx.http.post(`/guardian-invites/${inv.body.inviteCode}/accept`).set(auth(token)).expect(400);
    expect(self.body.error).toBe('cannot_guard_self');

    const fatherToken = await login(ctx, '+201099000005');
    await ctx.http.post(`/guardian-invites/${inv.body.inviteCode}/accept`).set(auth(fatherToken)).expect(200);
    const again = await ctx.http.post('/guardians').set(auth(token)).send({ name: 'Baba 2', relationship: 'father', permissions: NONE }).expect(201);
    const dup = await ctx.http.post(`/guardian-invites/${again.body.inviteCode}/accept`).set(auth(fatherToken)).expect(409);
    expect(dup.body.error).toBe('already_guardian');
  });

  it('requires sign-in to accept and 404s unknown codes', async () => {
    await ctx.http.post('/guardian-invites/nope/accept').expect(401);
    await ctx.http.get('/guardian-invites/does-not-exist').expect(404);
  });
});

describe('guardians: dashboard', () => {
  it('shows active introductions, approvals at stage 4 and safety for a wali-mode guardian', async () => {
    const { sara, ahmed, matchId, fatherToken } = await setup();
    const closedWith = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    await match(sara.id, closedWith.id, 2, 'closed');

    const links = await ctx.http.get('/guardian/members').set(auth(fatherToken)).expect(200);
    expect(links.body).toHaveLength(1);
    expect(links.body[0].memberId).toBe(sara.id);

    const dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.member).toMatchObject({ id: sara.id, firstName: 'Sara' });
    expect(dash.body.introductions).toHaveLength(1); // the closed match is not shown
    expect(dash.body.introductions[0]).toMatchObject({ matchId, otherId: ahmed.id, otherFirstName: 'Ahmed', stage: 4, opinion: null });
    expect(typeof dash.body.introductions[0].compatPct).toBe('number');
    expect(dash.body.pendingApprovals).toEqual([{ matchId, otherFirstName: 'Ahmed', nextStage: 5, memberReady: false, decision: null }]);
    expect(dash.body.sharedProfiles).toEqual([]);
    expect(dash.body.safety).toEqual({ allClear: true, openReports: 0 });
  });

  it('hides everything the member did not share', async () => {
    const { sara, fatherToken } = await setup({ ...NONE, see_matches: true });
    const dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.introductions).toHaveLength(1);
    expect(dash.body.introductions[0].compatPct).toBeNull(); // no see_reports
    expect(dash.body.pendingApprovals).toBeNull();
    expect(dash.body.sharedProfiles).toEqual([]);
    expect(dash.body.safety).toBeNull();
  });

  it('applies permission changes immediately and blocks a paused guardian', async () => {
    const { sara, saraToken, fatherToken, guardianId } = await setup();
    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ permissions: NONE }).expect(200);
    const dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.introductions).toBeNull();

    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ paused: true }).expect(200);
    const blocked = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(403);
    expect(blocked.body.error).toBe('guardian_paused');
  });

  it('counts open reports the member filed, without details', async () => {
    const { sara, ahmed, saraToken, fatherToken } = await setup();
    await ctx.http.post('/reports').set(auth(saraToken)).send({ subjectId: ahmed.id, category: 'scam', details: 'private' }).expect(200);
    const dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.safety).toEqual({ allClear: false, openReports: 1 });
    expect(JSON.stringify(dash.body)).not.toContain('private');
  });

  it('gives a stranger nothing', async () => {
    const { sara } = await setup();
    const stranger = await login(ctx, '+201099000099');
    await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(stranger)).expect(404);
  });
});

describe('guardians: opinions, removal and leaving', () => {
  it('lets a guardian give a private opinion that only the member sees', async () => {
    const { sara, ahmed, saraToken, fatherToken } = await setup();
    await ctx.http.put(`/guardian/members/${sara.id}/opinions/${ahmed.id}`).set(auth(fatherToken)).send({ opinion: 'discuss', note: ' Ask about work ' }).expect(200);
    await ctx.http.put(`/guardian/members/${sara.id}/opinions/${ahmed.id}`).set(auth(fatherToken)).send({ opinion: 'support' }).expect(200); // upsert

    const mine = await ctx.http.get('/guardians/opinions').set(auth(saraToken)).expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0]).toMatchObject({ guardianName: 'Baba', relationship: 'father', subjectId: ahmed.id, opinion: 'support', note: null });

    const dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.introductions[0].opinion).toEqual({ value: 'support', note: null });

    // Ahmed (the other person) never sees it.
    const ahmedToken = await login(ctx, ahmed.phone);
    const his = await ctx.http.get('/guardians/opinions').set(auth(ahmedToken)).expect(200);
    expect(his.body).toEqual([]);
  });

  it('refuses opinions on people the member is not matched with, or without permission', async () => {
    const { sara, ahmed, saraToken, fatherToken, guardianId } = await setup();
    const stranger = await createMember(ctx, { gender: 'male' });
    await ctx.http.put(`/guardian/members/${sara.id}/opinions/${stranger.id}`).set(auth(fatherToken)).send({ opinion: 'concern' }).expect(404);
    await ctx.http.put(`/guardian/members/${sara.id}/opinions/${ahmed.id}`).set(auth(fatherToken)).send({ opinion: 'maybe' }).expect(400);
    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ permissions: NONE }).expect(200);
    await ctx.http.put(`/guardian/members/${sara.id}/opinions/${ahmed.id}`).set(auth(fatherToken)).send({ opinion: 'support' }).expect(403);
  });

  it('removing a guardian ends access straight away and deletes their opinions', async () => {
    const { sara, ahmed, saraToken, fatherToken, guardianId } = await setup();
    await ctx.http.put(`/guardian/members/${sara.id}/opinions/${ahmed.id}`).set(auth(fatherToken)).send({ opinion: 'support' }).expect(200);
    await ctx.http.delete(`/guardians/${guardianId}`).set(auth(saraToken)).expect(200);
    await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(404);
    expect((await ctx.http.get('/guardian/members').set(auth(fatherToken)).expect(200)).body).toEqual([]);
    expect(await ctx.db.select().from(t.guardianOpinions)).toEqual([]);
  });

  it('lets a guardian step away themselves', async () => {
    const { sara, saraToken, fatherToken } = await setup();
    await ctx.http.delete(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect((await ctx.http.get('/guardians').set(auth(saraToken)).expect(200)).body).toEqual([]);
  });
});
