import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_QUALITY_FLOOR } from '@halal-meet/core';
import { createMember, createTestApp, login, truncateAll, type TestContext } from './helpers';
import { COMPATIBLE_ANSWERS, ans } from './fixtures';

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

const cards = (body: { items: Array<{ type: string; slot?: string; card?: { id: string; compatibility: { displayPct: number; truncated: boolean; reasons: unknown[]; discuss: unknown[]; dims: Record<string, unknown> }; keyFacts: unknown[]; sentYouSeriousInterest: boolean } }> }) =>
  body.items.filter((i) => i.type === 'profile').map((i) => i.card!);

describe('discover feed', () => {
  it('only returns eligible candidates: opposite gender, no dealbreaker violations, no other country while Open', async () => {
    // EG is forced Open via an override (below the 2000-profile density threshold in tests).
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);

    const viewer = await createMember(ctx, { gender: 'male',
      answers: { ...COMPATIBLE_ANSWERS, smoking: ans('never', ['never'], 'dealbreaker') },
    });
    const good = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const sameGender = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const dealbreaker = await createMember(ctx, { gender: 'female', answers: { ...COMPATIBLE_ANSWERS, smoking: ans('regularly', ['regularly'], 'important') } });
    const otherCountry = await createMember(ctx, { gender: 'female', country: 'JO', city: 'Amman', answers: COMPATIBLE_ANSWERS });

    const token = await login(ctx, viewer.phone);
    const feed = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    const ids = cards(feed.body).map((c) => c.id);

    expect(ids).toContain(good.id);
    expect(ids).not.toContain(sameGender.id);
    expect(ids).not.toContain(dealbreaker.id);
    expect(ids).not.toContain(otherCountry.id); // Open country → country-level scope only
    expect(feed.body.scope.countryStatus).toBe('open');
    expect(feed.body.scope.countries).toEqual(['EG']);
  });

  it('excludes same gender, dealbreaker violations and age misses per the preferences', async () => {
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const viewer = await createMember(ctx, { gender: 'male',
      answers: { ...COMPATIBLE_ANSWERS, smoking: ans('never', ['never'], 'dealbreaker') },
      preferences: { ageMin: 25, ageMax: 32 },
    });
    const inRange = await createMember(ctx, { gender: 'female', age: 28, answers: COMPATIBLE_ANSWERS });
    const tooOld = await createMember(ctx, { gender: 'female', age: 41, answers: COMPATIBLE_ANSWERS });
    const smoker = await createMember(ctx, { gender: 'female', answers: { ...COMPATIBLE_ANSWERS, smoking: ans('regularly') } });
    const male = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });

    const token = await login(ctx, viewer.phone);
    const feed = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    const ids = cards(feed.body).map((c) => c.id);
    expect(ids).toContain(inRange.id);
    expect(ids).not.toContain(tooOld.id);
    expect(ids).not.toContain(smoker.id);
    expect(ids).not.toContain(male.id);
  });

  it('paginates with a cursor without duplicates and reports endOfPool', async () => {
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const viewer = await createMember(ctx, { gender: 'male', age: 30, answers: COMPATIBLE_ANSWERS });
    for (let i = 0; i < 30; i++) {
      await createMember(ctx, { gender: 'female', age: 26 + (i % 8), answers: COMPATIBLE_ANSWERS });
    }
    const token = await login(ctx, viewer.phone);
    const page1 = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    expect(cards(page1.body)).toHaveLength(20);
    expect(page1.body.nextCursor).toBeTruthy();
    expect(page1.body.endOfPool).toBe(false);

    const page2 = await ctx.http
      .get(`/feed?cursor=${encodeURIComponent(page1.body.nextCursor)}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ids1 = cards(page1.body).map((c) => c.id);
    const ids2 = cards(page2.body).map((c) => c.id);
    expect(ids2.length).toBeGreaterThan(0);
    expect(ids2.filter((id) => ids1.includes(id))).toHaveLength(0);
    expect(page2.body.endOfPool).toBe(true);
    expect(page2.body.nextCursor).toBeNull();
    // The union covers every eligible candidate exactly once.
    expect(new Set([...ids1, ...ids2]).size).toBe(ids1.length + ids2.length);
  });

  it('inserts a divider before cards below the quality floor and mixes slots', async () => {
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const viewer = await createMember(ctx, { gender: 'male', age: 30, answers: COMPATIBLE_ANSWERS });
    // A weak candidate: no shared answers at all → low score, still eligible.
    for (let i = 0; i < 25; i++) await createMember(ctx, { gender: 'female', age: 30, answers: {} });
    for (let i = 0; i < 3; i++) await createMember(ctx, { gender: 'female', age: 30, answers: COMPATIBLE_ANSWERS });
    const seriousSender = await createMember(ctx, { gender: 'female', age: 30, answers: COMPATIBLE_ANSWERS });
    const fresh = await createMember(ctx, { gender: 'female', age: 30, answers: COMPATIBLE_ANSWERS, createdAt: new Date() });
    await ctx.db.insert((await import('../src/db/schema')).interests).values({
      id: (await import('../src/common/ids')).uuidv7(),
      fromId: seriousSender.id,
      toId: viewer.id,
      level: 'serious',
      status: 'pending',
    });

    const token = await login(ctx, viewer.phone);
    const feed = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    const items = feed.body.items as Array<{ type: string; slot?: string; kind?: string; card?: { id: string } }>;
    // Pinned serious first.
    expect(items[0]!.slot).toBe('pinned_serious');
    expect(items[0]!.card!.id).toBe(seriousSender.id);
    expect(items.some((i) => i.slot === 'new_member' && i.card!.id === fresh.id)).toBe(true);
    // Divider appears before the first below-floor card when the pool has one.
    const allCards = cards(feed.body);
    const firstBelow = allCards.findIndex((c) => c.compatibility.displayPct < DEFAULT_QUALITY_FLOOR);
    if (firstBelow >= 0) {
      const dividerIndex = items.findIndex((i) => i.type === 'divider');
      expect(dividerIndex).toBeGreaterThanOrEqual(0);
      const cardIndexes = items.map((i, idx) => (i.type === 'profile' ? idx : -1)).filter((i) => i >= 0);
      expect(dividerIndex).toBeLessThan(cardIndexes[firstBelow]!);
      const after = items.slice(cardIndexes[firstBelow]!);
      expect(after[0]!.slot).toBe('broader');
    }
  });

  it('gates the compatibility report by plan', async () => {
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const freeViewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const goldViewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS, subscription: 'gold' });
    await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS, city: 'Giza' });

    const freeToken = await login(ctx, freeViewer.phone);
    const freeFeed = await ctx.http.get('/feed').set('Authorization', `Bearer ${freeToken}`).expect(200);
    const freeCard = cards(freeFeed.body)[0]!;
    expect(freeCard.compatibility.truncated).toBe(true);
    expect(freeCard.compatibility.reasons.length).toBeLessThanOrEqual(3);
    expect(freeCard.compatibility.discuss.length).toBeLessThanOrEqual(1);
    expect(Object.keys(freeCard.compatibility.dims).sort()).toEqual(['location', 'timeline']);

    const goldToken = await login(ctx, goldViewer.phone);
    const goldFeed = await ctx.http.get('/feed').set('Authorization', `Bearer ${goldToken}`).expect(200);
    const goldCard = cards(goldFeed.body)[0]!;
    expect(goldCard.compatibility.truncated).toBe(false);
    expect(Object.keys(goldCard.compatibility.dims).length).toBeGreaterThan(2);
  });

  it('returns up to 5 key facts from the person’s own core-topic answers', async () => {
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const viewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, viewer.phone);
    const feed = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    const card = cards(feed.body)[0]!;
    expect(card.keyFacts.length).toBe(5);
    const keys = card.keyFacts.map((f) => (f as { questionKey: string }).questionKey);
    expect(new Set(keys).size).toBe(5);
  });

  it('surfaces an end-of-pool state with honest Passport counts by country', async () => {
    const viewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS, country: 'EG' });
    // Two compatible women in the UAE — not visible without a Passport.
    await createMember(ctx, { gender: 'female', country: 'AE', city: 'Dubai', answers: COMPATIBLE_ANSWERS });
    await createMember(ctx, { gender: 'female', country: 'AE', city: 'Dubai', answers: COMPATIBLE_ANSWERS });
    await createMember(ctx, { gender: 'female', country: 'SA', city: 'Jeddah', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, viewer.phone);
    const feed = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    expect(feed.body.endOfPool).toBe(true);
    const suggestion = feed.body.passportSuggestions.find((s: { country: string }) => s.country === 'AE');
    expect(suggestion.compatibleCount).toBe(2);
    const sa = feed.body.passportSuggestions.find((s: { country: string }) => s.country === 'SA');
    expect(sa.compatibleCount).toBe(1);
  });

  it('picks Top Picks daily and removes them from the feed', async () => {
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const viewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    for (let i = 0; i < 6; i++) await createMember(ctx, { gender: 'female', age: 26 + i, answers: COMPATIBLE_ANSWERS });

    const token = await login(ctx, viewer.phone);
    const picks = await ctx.http.get('/top-picks').set('Authorization', `Bearer ${token}`).expect(200);
    expect(picks.body.cards.length).toBe(3); // free plan
    expect(new Date(picks.body.refreshesAt).getTime()).toBeGreaterThan(Date.now());

    const feed = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    const feedIds = cards(feed.body).map((c) => c.id);
    const pickIds = picks.body.cards.map((c: { id: string }) => c.id);
    expect(pickIds.filter((id: string) => feedIds.includes(id))).toHaveLength(0);

    // Cached for the day: a second call returns the same picks.
    const again = await ctx.http.get('/top-picks').set('Authorization', `Bearer ${token}`).expect(200);
    expect(again.body.cards.map((c: { id: string }) => c.id)).toEqual(pickIds);
  });

  it('counts new profiles since the last visit', async () => {
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const viewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, viewer.phone);
    await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS, createdAt: new Date() });
    const second = await ctx.http.get('/feed').set('Authorization', `Bearer ${token}`).expect(200);
    expect(second.body.newSinceLastVisit).toBe(1);
  });

  it('serves a profile card for an eligible candidate and refuses an ineligible one', async () => {
    await ctx.db.insert((await import('../src/db/schema')).countryStatusOverrides).values([{ code: 'EG', status: 'open' }]);
    const viewer = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const eligible = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS });
    const sameGender = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
    const token = await login(ctx, viewer.phone);

    const ok = await ctx.http.get(`/profiles/${eligible.id}`).set('Authorization', `Bearer ${token}`).expect(200);
    expect(ok.body.id).toBe(eligible.id);
    expect(ok.body.compatibility.displayPct).toBeGreaterThan(0);
    expect(ok.body.photoState).toBe('visible'); // no photo → initials

    await ctx.http.get(`/profiles/${sameGender.id}`).set('Authorization', `Bearer ${token}`).expect(403);
  });
});
