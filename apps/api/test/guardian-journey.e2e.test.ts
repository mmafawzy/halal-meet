import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CORE_TOPIC_KEYS, defaultGuardianPermissions, type GuardianPermissions } from '@halal-meet/core';
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

interface MatchRow {
  matchId: string;
  stage: number;
  guardians: unknown;
  pendingGuardianApproval: unknown;
}

/** Sara (stage-4 match with Ahmed) with an accepted guardian. */
async function setup(permissions: GuardianPermissions = defaultGuardianPermissions('wali')) {
  const sara = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
  const ahmed = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
  const matchId = uuidv7();
  await ctx.db.insert(t.matches).values({ id: matchId, aId: sara.id, bId: ahmed.id, stage: 4, status: 'active' });
  const saraToken = await login(ctx, sara.phone);
  const ahmedToken = await login(ctx, ahmed.phone);
  const invite = await ctx.http.post('/guardians').set(auth(saraToken)).send({ name: 'Baba', relationship: 'father', permissions }).expect(201);
  const fatherToken = await login(ctx, '+201099000001');
  await ctx.http.post(`/guardian-invites/${invite.body.inviteCode}/accept`).set(auth(fatherToken)).expect(200);
  return { sara, ahmed, matchId, saraToken, ahmedToken, fatherToken, guardianId: invite.body.guardian.id as string };
}

async function coverTopics(matchId: string, n = 12) {
  await ctx.db.insert(t.topicCoverage).values(CORE_TOPIC_KEYS.slice(0, n).map((topicKey) => ({ matchId, topicKey })));
}

async function matchOf(token: string, matchId: string): Promise<MatchRow> {
  const res = await ctx.http.get('/matches').set(auth(token)).expect(200);
  return (res.body as MatchRow[]).find((m) => m.matchId === matchId)!;
}

const ready = (token: string, matchId: string, stage: number) =>
  ctx.http.post(`/matches/${matchId}/stage-ready`).set(auth(token)).send({ stage }).expect(200);

const decide = (token: string, memberId: string, matchId: string, stage: number, decision: string) =>
  ctx.http.put(`/guardian/members/${memberId}/approvals/${matchId}`).set(auth(token)).send({ stage, decision });

describe('guardian presence in conversations', () => {
  it('shows both sides the active guardians, by relationship and role only', async () => {
    const { matchId, saraToken, ahmedToken } = await setup();
    const presence = { relationship: 'father', readsConversation: true, participates: true };

    const forAhmed = await matchOf(ahmedToken, matchId);
    expect(forAhmed.guardians).toEqual({ mine: [], theirs: [presence] });
    expect(JSON.stringify(forAhmed)).not.toContain('Baba'); // never the name

    expect((await matchOf(saraToken, matchId)).guardians).toEqual({ mine: [presence], theirs: [] });
  });

  it('leaves out paused and not-yet-accepted guardians', async () => {
    const { matchId, saraToken, ahmedToken, guardianId } = await setup();
    await ctx.http.post('/guardians').set(auth(saraToken)).send({ name: 'Mama', relationship: 'mother', permissions: NONE }).expect(201);
    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ paused: true }).expect(200);
    expect((await matchOf(ahmedToken, matchId)).guardians).toEqual({ mine: [], theirs: [] });
  });
});

describe('guardian stage approvals', () => {
  it('holds stage 5 until the approving guardian approves, then moves on', async () => {
    const { sara, matchId, saraToken, ahmedToken, fatherToken } = await setup();
    await coverTopics(matchId);
    await ready(saraToken, matchId, 5);
    await ready(ahmedToken, matchId, 5);

    let m = await matchOf(saraToken, matchId);
    expect(m.stage).toBe(4);
    expect(m.pendingGuardianApproval).toEqual({ stage: 5, mine: true, theirs: false });
    expect((await matchOf(ahmedToken, matchId)).pendingGuardianApproval).toEqual({ stage: 5, mine: false, theirs: true });

    let dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.pendingApprovals).toEqual([{ matchId, otherFirstName: 'Ahmed', nextStage: 5, memberReady: true, decision: null }]);

    // "Discuss first" is recorded but does not move the stage.
    await decide(fatherToken, sara.id, matchId, 5, 'discuss').expect(200);
    expect((await matchOf(saraToken, matchId)).stage).toBe(4);
    dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.pendingApprovals[0].decision).toBe('discuss');

    await decide(fatherToken, sara.id, matchId, 5, 'approve').expect(200);
    m = await matchOf(saraToken, matchId);
    expect(m.stage).toBe(5);
    expect(m.pendingGuardianApproval).toBeNull();
    const [row] = await ctx.db.select().from(t.matches);
    expect(row!.stage).toBe(5); // stored, not just computed
    dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.pendingApprovals).toEqual([{ matchId, otherFirstName: 'Ahmed', nextStage: 6, memberReady: false, decision: null }]);
  });

  it('reaches stage 6 only when both are ready and the guardian approves', async () => {
    const { sara, matchId, saraToken, ahmedToken, fatherToken } = await setup();
    await ctx.db.update(t.matches).set({ stage: 5 });
    await ready(saraToken, matchId, 6);
    expect((await matchOf(saraToken, matchId)).pendingGuardianApproval).toBeNull(); // only one side is ready
    await ready(ahmedToken, matchId, 6);
    expect(await matchOf(saraToken, matchId)).toMatchObject({ stage: 5, pendingGuardianApproval: { stage: 6, mine: true, theirs: false } });

    await decide(fatherToken, sara.id, matchId, 5, 'approve').expect(409); // the match is already past stage 4
    await decide(fatherToken, sara.id, matchId, 6, 'approve').expect(200);
    expect(await matchOf(saraToken, matchId)).toMatchObject({ stage: 6, pendingGuardianApproval: null });
  });

  it('needs no approval when nobody has an approving guardian', async () => {
    const { matchId, saraToken, ahmedToken, guardianId } = await setup();
    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ permissions: { ...NONE, see_matches: true } }).expect(200);
    await coverTopics(matchId);
    await ready(saraToken, matchId, 5);
    await ready(ahmedToken, matchId, 5);
    expect(await matchOf(saraToken, matchId)).toMatchObject({ stage: 5, pendingGuardianApproval: null });
  });

  it('waits for both families when both have approving guardians', async () => {
    const { sara, ahmed, matchId, saraToken, ahmedToken, fatherToken } = await setup();
    const inv = await ctx.http.post('/guardians').set(auth(ahmedToken)).send({ name: 'Ammi', relationship: 'uncle', permissions: defaultGuardianPermissions('wali') }).expect(201);
    const uncleToken = await login(ctx, '+201099000002');
    await ctx.http.post(`/guardian-invites/${inv.body.inviteCode}/accept`).set(auth(uncleToken)).expect(200);
    await coverTopics(matchId);
    await ready(saraToken, matchId, 5);
    await ready(ahmedToken, matchId, 5);
    await decide(fatherToken, sara.id, matchId, 5, 'approve').expect(200);
    expect(await matchOf(saraToken, matchId)).toMatchObject({ stage: 4, pendingGuardianApproval: { stage: 5, mine: false, theirs: true } });
    await decide(uncleToken, ahmed.id, matchId, 5, 'approve').expect(200);
    expect((await matchOf(saraToken, matchId)).stage).toBe(5);
  });

  it('refuses approvals without the permission, while paused, or for an unknown match', async () => {
    const { sara, matchId, saraToken, fatherToken, guardianId } = await setup({ ...NONE, see_matches: true });
    await decide(fatherToken, sara.id, matchId, 5, 'approve').expect(403);
    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ permissions: defaultGuardianPermissions('wali') }).expect(200);
    await decide(fatherToken, sara.id, uuidv7(), 5, 'approve').expect(404);
    await decide(fatherToken, sara.id, matchId, 4, 'approve').expect(400);
    await decide(fatherToken, sara.id, matchId, 5, 'yes').expect(400);
    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ paused: true }).expect(200);
    await decide(fatherToken, sara.id, matchId, 5, 'approve').expect(403);
  });
});

describe('sharing profiles with guardians', () => {
  it('shares a profile, collects an opinion on it, and unshares it', async () => {
    const { sara, saraToken, fatherToken } = await setup();
    const khaled = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    await ctx.http.post('/guardians/shares').set(auth(saraToken)).send({ subjectId: khaled.id }).expect(200);
    await ctx.http.post('/guardians/shares').set(auth(saraToken)).send({ subjectId: khaled.id }).expect(200); // idempotent

    let dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.sharedProfiles).toHaveLength(1);
    expect(dash.body.sharedProfiles[0]).toMatchObject({ subjectId: khaled.id, firstName: 'Ahmed', opinion: null });
    expect(typeof dash.body.sharedProfiles[0].compatPct).toBe('number');

    await ctx.http.put(`/guardian/members/${sara.id}/opinions/${khaled.id}`).set(auth(fatherToken)).send({ opinion: 'concern', note: 'Too far' }).expect(200);
    dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.sharedProfiles[0].opinion).toEqual({ value: 'concern', note: 'Too far' });
    const mine = await ctx.http.get('/guardians/opinions').set(auth(saraToken)).expect(200);
    expect(mine.body.map((o: { subjectId: string }) => o.subjectId)).toContain(khaled.id);

    await ctx.http.delete(`/guardians/shares/${khaled.id}`).set(auth(saraToken)).expect(200);
    dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.sharedProfiles).toEqual([]);
  });

  it('validates shares and hides them from guardians without see_matches', async () => {
    const { sara, saraToken, fatherToken, guardianId } = await setup();
    await ctx.http.post('/guardians/shares').set(auth(saraToken)).send({ subjectId: sara.id }).expect(400);
    await ctx.http.post('/guardians/shares').set(auth(saraToken)).send({ subjectId: uuidv7() }).expect(404);
    await ctx.http.post('/guardians/shares').set(auth(saraToken)).send({ subjectId: 'nope' }).expect(400);
    const khaled = await createMember(ctx, { gender: 'male' });
    await ctx.http.post('/guardians/shares').set(auth(saraToken)).send({ subjectId: khaled.id }).expect(200);
    await ctx.http.patch(`/guardians/${guardianId}`).set(auth(saraToken)).send({ permissions: { ...NONE, safety_alerts: true } }).expect(200);
    const dash = await ctx.http.get(`/guardian/members/${sara.id}`).set(auth(fatherToken)).expect(200);
    expect(dash.body.sharedProfiles).toBeNull();
  });
});
