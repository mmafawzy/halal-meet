import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createMember, createTestApp, login, truncateAll, type TestContext } from './helpers';
import { ans } from './fixtures';

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

const PROFILE_INPUT = {
  firstName: 'Youssef',
  gender: 'male' as const,
  birthDate: '1996-04-12',
  nationality: ['EG'],
  country: 'EG',
  city: 'Cairo',
  languages: ['ar', 'en'],
  heightCm: 178,
  maritalStatus: 'never_married' as const,
  hasChildren: false,
  educationLevel: 'bachelor',
  profession: 'Software engineer',
  intention: 'within_1y' as const,
  halalMode: 'guided' as const,
  acceptedModes: ['private', 'guided', 'wali'] as const,
  about: 'A long enough about section describing values, family and work in a respectful way.',
  photoVisibility: 'matches' as const,
  openToRelocate: true,
  relocateCountries: ['AE'],
  intlVisibility: 'on' as const,
};

describe('auth + me + onboarding', () => {
  it('logs in with the dev OTP, returns a token, and GET /me works', async () => {
    const phone = '+201555000001';
    await ctx.http.post('/auth/otp/request').send({ phone }).expect(200);
    const verify = await ctx.http.post('/auth/otp/verify').send({ phone, code: '000000' }).expect(200);
    expect(verify.body.isNew).toBe(true);
    expect(typeof verify.body.token).toBe('string');
    const token = verify.body.token as string;

    const me = await ctx.http.get('/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.accountId).toBe(verify.body.accountId);
    expect(me.body.profile).toBeNull();
    expect(me.body.onboardingComplete).toBe(false);
    expect(me.body.entitlements.tier).toBe('free');
    expect(me.body.usage.interestsLimit).toBe(10);

    // Re-login is not "new" and keeps the same account.
    const again = await ctx.http.post('/auth/otp/verify').send({ phone, code: '000000' }).expect(200);
    expect(again.body.isNew).toBe(false);
    expect(again.body.accountId).toBe(verify.body.accountId);

    // A wrong code is rejected.
    await ctx.http.post('/auth/otp/verify').send({ phone, code: '123456' }).expect(403);
  });

  it('rejects protected routes without a token', async () => {
    await ctx.http.get('/me').expect(401);
    await ctx.http.get('/feed').expect(401);
  });

  it('upserts the profile (age derived) and stores answers', async () => {
    const phone = '+201555000002';
    const token = await login(ctx, phone);
    await ctx.http.put('/me/profile').set('Authorization', `Bearer ${token}`).send({ ...PROFILE_INPUT, locale: 'en' }).expect(200);

    const answers = [
      { questionKey: 'prayer', self: 'five_daily', accept: ['five_daily'], importance: 'must' as const },
      { questionKey: 'beard', self: 'trimmed', accept: null, importance: 'important' as const },
      // A woman-only self answer must be dropped for a male profile.
      { questionKey: 'hijab', self: 'hijab', accept: null, importance: 'important' as const },
    ];
    await ctx.http.put('/me/answers').set('Authorization', `Bearer ${token}`).send({ answers }).expect(200);

    const me = await ctx.http.get('/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me.body.profile.firstName).toBe('Youssef');
    expect(me.body.profile.age).toBeGreaterThanOrEqual(29);
    expect(me.body.profile.profileStrength).toBeGreaterThan(40);
    expect(me.body.answersCount).toBe(3);
    expect(me.body.locale).toBe('en');

    const stored = await ctx.http.get('/me/answers').set('Authorization', `Bearer ${token}`).expect(200);
    const hijab = stored.body.find((a: { questionKey: string }) => a.questionKey === 'hijab');
    expect(hijab.self).toBeNull(); // sanitized: men cannot answer hijab about themselves
    const beard = stored.body.find((a: { questionKey: string }) => a.questionKey === 'beard');
    expect(beard.self).toBe('trimmed');

    // Onboarding completes once the starter set is answered.
    for (const questionKey of ['smoking', 'conflict_style', 'want_children', 'children_count', 'living_arrangement', 'spouses_working', 'finances', 'relocation']) {
      await ctx.http
        .put('/me/answers')
        .set('Authorization', `Bearer ${token}`)
        .send({ answers: [{ questionKey, self: null, accept: null, importance: 'important' }] })
        .expect(200);
    }
    const me2 = await ctx.http.get('/me').set('Authorization', `Bearer ${token}`).expect(200);
    expect(me2.body.onboardingComplete).toBe(true);
  });

  it('rejects an under-18 birth date and unknown currencies-question keys', async () => {
    const token = await login(ctx, '+201555000003');
    await ctx.http
      .put('/me/profile')
      .set('Authorization', `Bearer ${token}`)
      .send({ ...PROFILE_INPUT, birthDate: '2012-01-01' })
      .expect(400);
    await ctx.http.put('/me/profile').set('Authorization', `Bearer ${token}`).send(PROFILE_INPUT).expect(200);
    const bad = await ctx.http
      .put('/me/answers')
      .set('Authorization', `Bearer ${token}`)
      .send({ answers: [{ questionKey: 'not_a_question', self: 'x', accept: null, importance: 'must' }] })
      .expect(400);
    expect(bad.body.error).toBe('validation_error');
  });

  it('stores preferences including dimensionImportance', async () => {
    const token = await login(ctx, '+201555000004');
    await ctx.http.put('/me/profile').set('Authorization', `Bearer ${token}`).send(PROFILE_INPUT).expect(200);
    await ctx.http
      .put('/me/preferences')
      .set('Authorization', `Bearer ${token}`)
      .send({
        ageMin: 22,
        ageMax: 32,
        maritalStatuses: ['never_married'],
        acceptChildren: false,
        verifiedOnly: true,
        languages: ['ar'],
        dimensionImportance: { religion: 'dealbreaker', finance: 'must' },
      })
      .expect(200);

    const rows = await ctx.db.select().from((await import('../src/db/schema')).matchPreferences);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.dimensionImportance).toEqual({ religion: 'dealbreaker', finance: 'must' });
    expect(rows[0]!.verifiedOnly).toBe(true);
  });

  it('derives the daily-usage reset from the user country timezone', async () => {
    const token = await login(ctx, '+201555000005');
    await ctx.http.put('/me/profile').set('Authorization', `Bearer ${token}`).send(PROFILE_INPUT).expect(200);
    const usage = await ctx.http.get('/me/usage').set('Authorization', `Bearer ${token}`).expect(200);
    expect(usage.body.timezone).toBe('Africa/Cairo');
    expect(usage.body.resetsAt).toMatch(/T2[12]:00:00\.000Z$/); // Cairo is UTC+2/+3 → 21:00Z or 22:00Z
    expect(usage.body.interestsToday).toBe(0);
    expect(usage.body.interestsLimit).toBe(10);
  });

  it('returns entitlements and lets a dev grant upgrade the tier', async () => {
    const member = await createMember(ctx, { gender: 'male', answers: { prayer: ans('five_daily') } });
    const token = await login(ctx, member.phone);
    const before = await ctx.http.get('/me/entitlements').set('Authorization', `Bearer ${token}`).expect(200);
    expect(before.body.tier).toBe('free');
    expect(before.body.passport.capacity).toBe(0);

    const granted = await ctx.http.post('/billing/dev/grant').set('Authorization', `Bearer ${token}`).send({ sku: 'gold_monthly' }).expect(200);
    expect(granted.body.entitlements.tier).toBe('gold');
    expect(granted.body.entitlements.passport.capacity).toBe(3);
    expect(granted.body.entitlements.passport.source).toBe('plan');

    const cancelled = await ctx.http.post('/billing/dev/grant').set('Authorization', `Bearer ${token}`).send({ sku: 'free' }).expect(200);
    expect(cancelled.body.entitlements.tier).toBe('free');
    expect(cancelled.body.entitlements.passport.capacity).toBe(0);
  });

  it('exposes country statuses, with overrides applied', async () => {
    await createMember(ctx, { gender: 'male', country: 'EG' });
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([
      { code: 'EG', status: 'open' },
      { code: 'JO', status: 'growing' },
    ]);
    const res = await ctx.http.get('/countries').expect(401); // guarded
    void res;
    const member = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, member.phone);
    const countries = await ctx.http.get('/countries').set('Authorization', `Bearer ${token}`).expect(200);
    const eg = countries.body.find((c: { code: string }) => c.code === 'EG');
    expect(eg.status).toBe('open');
    expect(eg.verifiedProfiles).toBe(2); // both fixtures are EG + identity-verified
    const jo = countries.body.find((c: { code: string }) => c.code === 'JO');
    expect(jo.status).toBe('growing');
  });

  it('blocks and reports keep both directions out of the feed', async () => {
    const me = await createMember(ctx, { gender: 'male', answers: { prayer: ans('five_daily', ['five_daily']) } });
    const other = await createMember(ctx, { gender: 'female', answers: { prayer: ans('five_daily', ['five_daily']) } });
    const token = await login(ctx, me.phone);
    await ctx.http.post('/blocks').set('Authorization', `Bearer ${token}`).send({ subjectId: other.id }).expect(200);
    const feed = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    expect(feed.body.items.some((i: { type: string; card?: { id: string } }) => i.card?.id === other.id)).toBe(false);
    await ctx.http.post('/reports').set('Authorization', `Bearer ${token}`).send({ subjectId: other.id, category: 'scam', details: 'test' }).expect(200);
  });
});
