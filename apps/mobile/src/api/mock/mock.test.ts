import { defaultGuardianPermissions, PLAN_LIMITS, type ProfileInput } from '@halal-meet/core';
import { describe, expect, it } from 'vitest';

import { LimitReachedError, type HalalMeetApi } from '../types';
import { createMockApi } from './index';
import { detectRisk } from './content';

const PROFILE: ProfileInput = {
  firstName: 'Ahmed',
  gender: 'male',
  birthDate: '1995-03-10',
  nationality: ['EG'],
  country: 'EG',
  city: 'Cairo',
  languages: ['ar', 'en'],
  maritalStatus: 'never_married',
  hasChildren: false,
  intention: 'within_1y',
  halalMode: 'guided',
  acceptedModes: ['private', 'guided', 'wali'],
  photoVisibility: 'request',
  openToRelocate: false,
  relocateCountries: [],
  intlVisibility: 'on',
};

function setup(opts: Parameters<typeof createMockApi>[0] = {}) {
  let t = new Date('2026-10-08T10:00:00');
  const api = createMockApi({ latencyMs: 0, replyDelayMs: 1000, now: () => t, ...opts });
  return {
    api,
    advance: (ms: number) => {
      t = new Date(t.getTime() + ms);
    },
  };
}

async function onboard(api: HalalMeetApi, profile: Partial<ProfileInput> = {}) {
  await api.otpRequest({ phone: '+201000000000' });
  await api.otpVerify({ phone: '+201000000000', code: '000000' });
  await api.updateProfile({ ...PROFILE, ...profile });
  await api.putAnswers([
    { questionKey: 'prayer', self: 'five_daily', accept: null, importance: 'important' },
    { questionKey: 'smoking', self: 'never', accept: null, importance: 'important' },
    { questionKey: 'want_children', self: 'yes', accept: null, importance: 'important' },
  ]);
}

/** Collects profile ids from the feed (several pages). */
async function feedIds(api: HalalMeetApi, max = 40): Promise<string[]> {
  const ids: string[] = [];
  let cursor: string | null = null;
  do {
    const page = await api.feed(cursor);
    for (const it of page.items) if (it.type === 'profile') ids.push(it.card.id);
    cursor = page.nextCursor;
  } while (cursor && ids.length < max);
  return ids;
}

describe('mock API — auth & onboarding', () => {
  it('accepts any 6-digit OTP (000000) and rejects malformed codes', async () => {
    const { api } = setup();
    await expect(api.otpVerify({ phone: '+1', code: '000000' })).resolves.toMatchObject({ isNew: true });
    await expect(api.otpVerify({ phone: '+1', code: '12' })).rejects.toThrow();
  });

  it('marks onboarding complete once a profile and answers exist', async () => {
    const { api } = setup();
    expect((await api.me()).onboardingComplete).toBe(false);
    await onboard(api);
    const me = await api.me();
    expect(me.onboardingComplete).toBe(true);
    expect(me.profile?.firstName).toBe('Ahmed');
    expect(me.entitlements.tier).toBe('free');
  });

  it('rejects under-18 profiles', async () => {
    const { api } = setup();
    await expect(api.updateProfile({ ...PROFILE, birthDate: '2012-01-01' })).rejects.toThrow();
  });
});

describe('mock API — feed', () => {
  it('returns only opposite-gender, eligible profiles with compatibility', async () => {
    const { api } = setup();
    await onboard(api);
    const page = await api.feed(null);
    const cards = page.items.flatMap((i) => (i.type === 'profile' ? [i.card] : []));
    expect(cards.length).toBeGreaterThan(0);
    for (const c of cards) {
      expect(c.gender).toBe('female');
      expect(c.compatibility.displayPct).toBeGreaterThanOrEqual(0);
      // free plan: top 3 reasons + 1 discuss flag
      expect(c.compatibility.reasons.length).toBeLessThanOrEqual(3);
      expect(c.compatibility.discuss.length).toBeLessThanOrEqual(1);
    }
  });

  it('paginates with a cursor without repeating profiles', async () => {
    const { api } = setup();
    await onboard(api);
    const ids = await feedIds(api, 100);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('mock API — plan limits', () => {
  it(`enforces ${PLAN_LIMITS.free.dailyInterests} daily interests on free with a 402-style error`, async () => {
    const { api } = setup({ mutualRate: 0 });
    await onboard(api);
    const ids = await feedIds(api, 30);
    const limit = PLAN_LIMITS.free.dailyInterests!;
    expect(ids.length).toBeGreaterThan(limit);
    for (let i = 0; i < limit; i++) {
      await api.interest({ toId: ids[i]!, level: 'interest' });
    }
    const me = await api.me();
    expect(me.usage.interestsToday).toBe(limit);
    const err = await api.interest({ toId: ids[limit]!, level: 'interest' }).catch((e) => e);
    expect(err).toBeInstanceOf(LimitReachedError);
    expect((err as LimitReachedError).status).toBe(402);
    expect((err as LimitReachedError).usage?.interestsToday).toBe(limit);
  });

  it('resets the daily counter at local midnight', async () => {
    const { api, advance } = setup({ mutualRate: 0 });
    await onboard(api);
    const ids = await feedIds(api, 30);
    for (let i = 0; i < 10; i++) await api.interest({ toId: ids[i]!, level: 'interest' });
    advance(24 * 3600 * 1000);
    await expect(api.interest({ toId: ids[10]!, level: 'interest' })).resolves.toBeDefined();
  });

  it('Plus has unlimited interests (devGrant)', async () => {
    const { api } = setup({ mutualRate: 0 });
    await onboard(api);
    await api.devGrant({ sku: 'plus_monthly' });
    const ids = await feedIds(api, 30);
    for (let i = 0; i < 12; i++) await api.interest({ toId: ids[i]!, level: 'interest' });
    const me = await api.me();
    expect(me.usage.interestsLimit).toBeNull();
    expect(me.entitlements.tier).toBe('plus');
  });

  it('limits Serious Interest to 1 per week on free', async () => {
    const { api } = setup({ mutualRate: 0 });
    await onboard(api);
    const ids = await feedIds(api, 5);
    await api.interest({ toId: ids[0]!, level: 'serious', note: 'Salam' });
    await expect(api.interest({ toId: ids[1]!, level: 'serious' })).rejects.toBeInstanceOf(LimitReachedError);
  });

  it('shows free users only the count of incoming interests (serious ones always visible)', async () => {
    const { api } = setup();
    await onboard(api);
    const free = await api.incoming();
    expect(free.count).toBeGreaterThan(0);
    expect(free.cards.every((c) => c.level === 'serious')).toBe(true);
    await api.devGrant({ sku: 'plus_monthly' });
    const plus = await api.incoming();
    expect(plus.cards.length).toBe(plus.count);
  });
});

describe('mock API — matches & messages', () => {
  it('turns roughly 30% of interests into matches', async () => {
    const { api } = setup();
    await onboard(api);
    await api.devGrant({ sku: 'plus_monthly' });
    const incoming = new Set((await api.incoming()).cards.map((c) => c.id));
    const ids = (await feedIds(api, 80)).filter((id) => !incoming.has(id)).slice(0, 40);
    let matched = 0;
    for (const id of ids) if ((await api.interest({ toId: id, level: 'interest' })).matched) matched++;
    const rate = matched / ids.length;
    expect(rate).toBeGreaterThan(0.1);
    expect(rate).toBeLessThan(0.55);
  });

  it('flags risky messages and reveals topic cards after the simulated answer', async () => {
    const { api, advance } = setup();
    await onboard(api);
    const [match] = await api.matches();
    expect(match).toBeDefined();
    const risky = await api.sendMessage(match!.matchId, { kind: 'text', body: 'Can you send money via Western Union?' });
    expect(risky.risk?.warning).toBe('money');
    const offPlatform = await api.sendMessage(match!.matchId, { kind: 'text', body: 'add me on whatsapp' });
    expect(offPlatform.risk?.warning).toBe('off_platform');

    const card = await api.sendMessage(match!.matchId, { kind: 'topic_card', topicKey: 'finances' });
    expect(card.topicAnswers).toEqual({ mine: null, theirs: null, revealed: false });
    advance(1500); // their simulated answer arrives
    const answered = await api.answerTopic(match!.matchId, card.id, { value: 'joint' });
    expect(answered.topicAnswers?.revealed).toBe(true);
    expect(answered.topicAnswers?.mine).toBe('joint');
    expect(answered.topicAnswers?.theirs).not.toBeNull();
  });
});

describe('mock API — Passport', () => {
  it('requires identity verification and capacity', async () => {
    const { api } = setup();
    await onboard(api);
    await expect(api.addPassport({ country: 'AE', purpose: 'relocate' })).rejects.toMatchObject({ status: 403 });
    await api.dev!.verifyIdentity();
    await expect(api.addPassport({ country: 'AE', purpose: 'relocate' })).rejects.toBeInstanceOf(LimitReachedError);
    await api.devGrant({ sku: 'passport_pass_7d' });
    await api.addPassport({ country: 'AE', purpose: 'relocate' });
    const pp = await api.passport();
    expect(pp.destinations).toHaveLength(1);
    expect(pp.entitlements.capacity).toBe(1);
    const page = await api.feed(null);
    expect(page.scope.kind).toBe('passport');
    for (const it of page.items) if (it.type === 'profile') expect(it.card.country).toBe('AE');
  });
});

describe('risk detection', () => {
  it('detects money and off-platform keywords in English and Arabic', () => {
    expect(detectRisk('please transfer the money')).toBe('money');
    expect(detectRisk('أرسل لي مبلغ صغير')).toBe('money');
    expect(detectRisk('كلمني على واتساب')).toBe('off_platform');
    expect(detectRisk('What does a good weekend look like?')).toBeNull();
    expect(detectRisk('الجمال في البساطة')).toBeNull();
  });
});

describe('mock API — guardians (member side)', () => {
  const PERMS = { ...defaultGuardianPermissions('guided') };

  it('invite → accept → pause/resume → permissions gate the dashboard → remove', async () => {
    const { api } = setup();
    await onboard(api);

    // Invite: status invited, a code that previews publicly.
    const { guardian, inviteCode } = await api.inviteGuardian({ name: 'Omar', relationship: 'father', permissions: PERMS });
    expect(guardian).toMatchObject({ name: 'Omar', status: 'invited', accepted: false, acceptedAt: null });
    expect(inviteCode).toMatch(/^[A-Z0-9]{8}$/);
    expect(await api.guardianInvitePreview(inviteCode)).toMatchObject({ memberFirstName: 'Ahmed', relationship: 'father' });
    expect(await api.guardians()).toHaveLength(1);

    // Re-issue: the old code stops working.
    const again = await api.reissueGuardianInvite(guardian.id);
    expect(again.inviteCode).not.toBe(inviteCode);
    await expect(api.guardianInvitePreview(inviteCode)).rejects.toMatchObject({ status: 404 });

    // Pausing before acceptance resumes back to "invited".
    expect((await api.updateGuardian(guardian.id, { paused: true })).status).toBe('paused');
    expect((await api.updateGuardian(guardian.id, { paused: false })).status).toBe('invited');

    // Accepting your own invitation is refused; the demo helper simulates the guardian's phone.
    await expect(api.acceptGuardianInvite(again.inviteCode)).rejects.toMatchObject({ status: 400, code: 'cannot_guard_self' });
    await expect(api.dev!.guardianDashboardFor(guardian.id)).rejects.toMatchObject({ status: 404 });
    const accepted = await api.dev!.simulateGuardianAccept(guardian.id);
    expect(accepted).toMatchObject({ status: 'active', accepted: true });
    expect(accepted.acceptedAt).not.toBeNull();
    await expect(api.reissueGuardianInvite(guardian.id)).rejects.toMatchObject({ status: 409 });
    await expect(api.guardianInvitePreview(again.inviteCode)).rejects.toMatchObject({ status: 404 });
    await expect(api.acceptGuardianInvite(again.inviteCode)).rejects.toMatchObject({ status: 409 });

    // Simulated acceptance seeds example opinions on the member's matches.
    const opinions = await api.guardianOpinions();
    expect(opinions.length).toBeGreaterThan(0);
    const matchIds = (await api.matches()).map((m) => m.other.id);
    for (const o of opinions) {
      expect(o).toMatchObject({ guardianId: guardian.id, guardianName: 'Omar', relationship: 'father' });
      expect(matchIds).toContain(o.subjectId);
    }

    // Dashboard with see_matches + see_reports + safety_alerts (guided defaults), no approvals.
    let dash = await api.dev!.guardianDashboardFor(guardian.id);
    expect(dash.member.firstName).toBe('Ahmed');
    expect(dash.introductions?.length).toBe((await api.matches()).filter((m) => m.status === 'active').length);
    expect(dash.introductions?.every((i) => typeof i.compatPct === 'number')).toBe(true);
    expect(dash.introductions?.some((i) => i.opinion !== null)).toBe(true);
    expect(dash.pendingApprovals).toBeNull();
    expect(dash.safety).toEqual({ allClear: true, openReports: 0 });

    // Pause → dashboard 403; resume → back to active (accepted).
    await api.updateGuardian(guardian.id, { paused: true });
    await expect(api.dev!.guardianDashboardFor(guardian.id)).rejects.toMatchObject({ status: 403, code: 'guardian_paused' });
    expect((await api.updateGuardian(guardian.id, { paused: false })).status).toBe('active');

    // Permissions gate each section.
    await api.updateGuardian(guardian.id, { permissions: { ...PERMS, see_reports: false, approve_stages: true } });
    dash = await api.dev!.guardianDashboardFor(guardian.id);
    expect(dash.introductions?.every((i) => i.compatPct === null)).toBe(true);
    expect(dash.pendingApprovals).toEqual([]);
    await api.updateGuardian(guardian.id, { permissions: { ...PERMS, see_matches: false, safety_alerts: false } });
    dash = await api.dev!.guardianDashboardFor(guardian.id);
    expect(dash.introductions).toBeNull();
    expect(dash.safety).toBeNull();

    // Safety counts open reports filed by the member.
    await api.updateGuardian(guardian.id, { permissions: PERMS });
    await api.report({ subjectId: matchIds[0]!, category: 'other' });
    expect((await api.dev!.guardianDashboardFor(guardian.id)).safety).toEqual({ allClear: false, openReports: 1 });

    // Remove: gone, with their opinions.
    await api.removeGuardian(guardian.id);
    expect(await api.guardians()).toHaveLength(0);
    expect(await api.guardianOpinions()).toHaveLength(0);
    await expect(api.updateGuardian(guardian.id, { paused: true })).rejects.toMatchObject({ status: 404 });
  });
});

describe('mock API — guardians (guardian side)', () => {
  it('previews and accepts the demo invitation, gives opinions and leaves', async () => {
    const { api } = setup();
    // A guardian only verifies their phone — no member profile needed.
    await api.otpVerify({ phone: '+201111111111', code: '000000' });
    const code = api.dev!.demoGuardianInviteCode;
    await expect(api.guardianInvitePreview('NOPE1234')).rejects.toMatchObject({ status: 404 });
    const preview = await api.guardianInvitePreview(code.toLowerCase());
    expect(preview.memberFirstName).toBe('Maryam');
    expect(preview.permissions.approve_stages).toBe(true);

    const link = await api.acceptGuardianInvite(code);
    expect(link).toMatchObject({ memberFirstName: 'Maryam', status: 'active' });
    await expect(api.acceptGuardianInvite(code)).rejects.toMatchObject({ status: 409 });
    expect(await api.guardianLinks()).toHaveLength(1);

    const dash = await api.guardianDashboard(link.memberId);
    expect(dash.introductions).toHaveLength(3);
    expect(dash.pendingApprovals).toHaveLength(1);
    expect(dash.pendingApprovals![0]!.nextStage).toBe(5);
    expect(dash.safety?.allClear).toBe(true);

    const subject = dash.introductions![0]!;
    await api.putGuardianOpinion(link.memberId, subject.otherId, { opinion: 'support', note: '  Looks good  ' });
    const after = await api.guardianDashboard(link.memberId);
    expect(after.introductions![0]!.opinion).toEqual({ value: 'support', note: 'Looks good' });
    await expect(api.putGuardianOpinion(link.memberId, 'not_a_match', { opinion: 'concern' })).rejects.toMatchObject({ status: 404 });

    await api.leaveGuardianship(link.memberId);
    expect(await api.guardianLinks()).toHaveLength(0);
    await expect(api.guardianDashboard(link.memberId)).rejects.toMatchObject({ status: 404 });
  });
});

describe('mock API — guardian presence, stage approvals and shares', () => {
  const WALI = { ...defaultGuardianPermissions('wali') };

  it('lists active guardians on both sides of a match', async () => {
    const { api } = setup();
    await onboard(api);
    let matches = await api.matches();
    expect(matches.length).toBeGreaterThan(0);
    for (const m of matches) {
      expect(m.guardians.mine).toEqual([]);
      expect(m.pendingGuardianApproval).toBeNull();
      // Seeded members in Wali mode have a father who reads and takes part.
      const expected = m.other.halalMode === 'wali' ? [{ relationship: 'father', readsConversation: true, participates: true }] : [];
      expect(m.guardians.theirs).toEqual(expected);
    }
    // The first seeded conversation is with someone in Wali mode (so the demo shows a presence line).
    expect(matches.some((m) => m.guardians.theirs.length > 0)).toBe(true);

    // Invited (not accepted) guardians are not shown; accepted ones are; paused ones are hidden again.
    const { guardian } = await api.inviteGuardian({ name: 'Omar', relationship: 'father', permissions: WALI });
    expect((await api.matches())[0]!.guardians.mine).toEqual([]);
    await api.dev!.simulateGuardianAccept(guardian.id);
    matches = await api.matches();
    for (const m of matches) expect(m.guardians.mine).toEqual([{ relationship: 'father', readsConversation: true, participates: true }]);
    await api.updateGuardian(guardian.id, { paused: true });
    expect((await api.matches())[0]!.guardians.mine).toEqual([]);
  });

  it('advances straight away without an approving guardian', async () => {
    const { api } = setup();
    await onboard(api);
    const m = (await api.matches())[0]!;
    await api.stageReady(m.matchId, { stage: 5 });
    const after = (await api.matches()).find((x) => x.matchId === m.matchId)!;
    expect(after.stage).toBe(5);
    expect(after.pendingGuardianApproval).toBeNull();
  });

  it('holds stage 5 and 6 until an approving guardian approves', async () => {
    const { api } = setup();
    await onboard(api);
    const { guardian } = await api.inviteGuardian({ name: 'Omar', relationship: 'father', permissions: WALI });
    const m0 = (await api.matches())[0]!;
    // Not accepted yet: no approving guardian to approve with.
    await expect(api.dev!.simulateGuardianApproval(m0.matchId)).rejects.toMatchObject({ status: 409 });
    await api.dev!.simulateGuardianAccept(guardian.id);

    const find = async () => (await api.matches()).find((x) => x.matchId === m0.matchId)!;
    const before = m0.stage;
    await api.stageReady(m0.matchId, { stage: 5 });
    let m = await find();
    expect(m.stage).toBe(before);
    expect(m.pendingGuardianApproval).toEqual({ stage: 5, mine: true, theirs: false });

    // The dashboard lists approvals only for matches at stage 4 or 5 (this one is earlier, the mock is lenient).
    let dash = await api.dev!.guardianDashboardFor(guardian.id);
    expect(dash.pendingApprovals).toEqual([]);

    await api.dev!.simulateGuardianApproval(m0.matchId);
    m = await find();
    expect(m.stage).toBe(5);
    expect(m.pendingGuardianApproval).toBeNull();

    // At stage 5 the guardian sees the next approval (meeting) as pending, member not ready yet.
    dash = await api.dev!.guardianDashboardFor(guardian.id);
    expect(dash.pendingApprovals).toEqual([expect.objectContaining({ matchId: m0.matchId, nextStage: 6, memberReady: false, decision: null })]);
    await api.stageReady(m0.matchId, { stage: 6 });
    m = await find();
    expect(m.pendingGuardianApproval).toEqual({ stage: 6, mine: true, theirs: false });
    dash = await api.dev!.guardianDashboardFor(guardian.id);
    expect(dash.pendingApprovals![0]).toMatchObject({ nextStage: 6, memberReady: true });

    // Pausing the only approving guardian lifts the gate (no active approver left).
    await api.updateGuardian(guardian.id, { paused: true });
    m = await find();
    expect(m.stage).toBe(6);
    expect(m.pendingGuardianApproval).toBeNull();
  });

  it('shares profiles with guardians and shows them on the dashboard', async () => {
    const { api } = setup();
    await onboard(api);
    const me = await api.me();
    const { guardian } = await api.inviteGuardian({ name: 'Omar', relationship: 'father', permissions: WALI });
    await api.dev!.simulateGuardianAccept(guardian.id);

    const subject = (await feedIds(api, 5))[0]!;
    await expect(api.shareWithGuardians('nobody')).rejects.toMatchObject({ status: 404 });
    await expect(api.shareWithGuardians(me.profile!.id)).rejects.toMatchObject({ status: 400 });
    await api.shareWithGuardians(subject);
    await api.shareWithGuardians(subject); // idempotent
    let dash = await api.dev!.guardianDashboardFor(guardian.id);
    expect(dash.sharedProfiles).toHaveLength(1);
    expect(dash.sharedProfiles![0]).toMatchObject({ subjectId: subject, opinion: null });
    expect(typeof dash.sharedProfiles![0]!.compatPct).toBe('number');

    await api.updateGuardian(guardian.id, { permissions: { ...WALI, see_reports: false } });
    expect((await api.dev!.guardianDashboardFor(guardian.id)).sharedProfiles![0]!.compatPct).toBeNull();
    await api.updateGuardian(guardian.id, { permissions: { ...WALI, see_matches: false } });
    expect((await api.dev!.guardianDashboardFor(guardian.id)).sharedProfiles).toBeNull();

    await api.updateGuardian(guardian.id, { permissions: WALI });
    await api.unshareWithGuardians(subject);
    dash = await api.dev!.guardianDashboardFor(guardian.id);
    expect(dash.sharedProfiles).toEqual([]);
  });

  it('lets the demo guardian approve or ask to discuss, and give opinions on shared profiles', async () => {
    const { api } = setup();
    await api.otpVerify({ phone: '+201111111111', code: '000000' });
    const code = api.dev!.demoGuardianInviteCode;
    expect((await api.guardianInvitePreview(code)).memberGender).toBe('female');
    const link = await api.acceptGuardianInvite(code);

    let dash = await api.guardianDashboard(link.memberId);
    const pending = dash.pendingApprovals![0]!;
    expect(pending).toMatchObject({ nextStage: 5, memberReady: true, decision: null });
    await expect(api.putGuardianApproval(link.memberId, 'nope', { stage: 5, decision: 'approve' })).rejects.toMatchObject({ status: 404 });
    await expect(api.putGuardianApproval(link.memberId, pending.matchId, { stage: 6, decision: 'approve' })).rejects.toMatchObject({ status: 409 });

    await api.putGuardianApproval(link.memberId, pending.matchId, { stage: 5, decision: 'discuss' });
    dash = await api.guardianDashboard(link.memberId);
    expect(dash.pendingApprovals![0]).toMatchObject({ matchId: pending.matchId, decision: 'discuss' });

    await api.putGuardianApproval(link.memberId, pending.matchId, { stage: 5, decision: 'approve' });
    dash = await api.guardianDashboard(link.memberId);
    expect(dash.introductions!.find((i) => i.matchId === pending.matchId)!.stage).toBe(5);
    expect(dash.pendingApprovals).toEqual([expect.objectContaining({ matchId: pending.matchId, nextStage: 6, memberReady: false, decision: null })]);

    expect(dash.sharedProfiles).toHaveLength(1);
    const shared = dash.sharedProfiles![0]!;
    await api.putGuardianOpinion(link.memberId, shared.subjectId, { opinion: 'discuss', note: 'Let us talk' });
    dash = await api.guardianDashboard(link.memberId);
    expect(dash.sharedProfiles![0]!.opinion).toEqual({ value: 'discuss', note: 'Let us talk' });
  });
});
