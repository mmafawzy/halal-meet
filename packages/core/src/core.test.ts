import { describe, expect, it } from 'vitest';
import {
  checkEligibility,
  computeCompatibility,
  computeCountryStatus,
  exposureMultiplier,
  passesDealbreakers,
  renderDiscuss,
  renderReason,
  type Answer,
  type EligibilityContext,
  type MatchProfile,
  type PassportDestination,
} from './index';

const now = new Date('2026-10-08T12:00:00Z');
const openEverywhere: EligibilityContext = { now, countryStatus: () => 'open' };

function profile(over: Partial<MatchProfile> & Pick<MatchProfile, 'id' | 'gender'>): MatchProfile {
  return {
    age: 28,
    country: 'EG',
    city: 'Cairo',
    languages: ['ar', 'en'],
    maritalStatus: 'never_married',
    hasChildren: false,
    intention: 'within_1y',
    halalMode: 'guided',
    acceptedModes: ['private', 'guided', 'wali'],
    identityVerified: true,
    openToRelocate: false,
    relocateCountries: [],
    intlVisibility: 'on',
    answers: [],
    dimensionImportance: {},
    preferences: { ageMin: 20, ageMax: 40, maritalStatuses: null, acceptChildren: true, verifiedOnly: false, languages: null },
    passport: [],
    ...over,
  };
}

const ans = (questionKey: string, self: string | null, importance: Answer['importance'] = 'important', accept: string[] | null = null): Answer => ({
  questionKey,
  self,
  accept,
  importance,
});

const passport = (over: Partial<PassportDestination>): PassportDestination => ({
  id: 'p1',
  country: 'AE',
  city: null,
  purpose: 'relocate',
  visitFrom: null,
  visitTo: null,
  visibleFrom: '2026-10-01T00:00:00Z',
  activeUntil: '2026-10-30T00:00:00Z',
  status: 'active',
  isWorldwide: false,
  ...over,
});

describe('computeCompatibility', () => {
  const shared = [
    ans('prayer', 'five_daily', 'must'),
    ans('want_children', 'yes', 'must'),
    ans('children_count', '3', 'important'),
    ans('living_arrangement', 'independent', 'important'),
    ans('finances', 'joint', 'important'),
  ];

  it('scores identical answers highly and gives reasons', () => {
    const a = profile({ id: 'a', gender: 'male', answers: shared });
    const b = profile({ id: 'b', gender: 'female', answers: shared });
    const r = computeCompatibility(a, b);
    expect(r.displayPct).toBeGreaterThanOrEqual(90);
    expect(r.reasons.map((x) => x.questionKey)).toContain('prayer');
    expect(r.discuss).toHaveLength(0);
  });

  it('is symmetric', () => {
    const a = profile({ id: 'a', gender: 'male', answers: shared });
    const b = profile({
      id: 'b',
      gender: 'female',
      answers: [ans('prayer', 'usually', 'important'), ans('want_children', 'maybe', 'must'), ans('children_count', '1')],
    });
    expect(computeCompatibility(a, b).overall).toBeCloseTo(computeCompatibility(b, a).overall, 10);
  });

  it('raises a discuss flag on important differences', () => {
    const a = profile({ id: 'a', gender: 'male', answers: [ans('kids_schooling', 'islamic', 'important')] });
    const b = profile({ id: 'b', gender: 'female', answers: [ans('kids_schooling', 'private', 'important')] });
    const r = computeCompatibility(a, b);
    expect(r.discuss.map((d) => d.questionKey)).toEqual(['kids_schooling']);
  });

  it('respects explicit partner preferences (accept) over own answer', () => {
    const man = profile({ id: 'a', gender: 'male', answers: [ans('hijab', null, 'must', ['hijab', 'niqab'])] });
    const woman = profile({ id: 'b', gender: 'female', answers: [ans('hijab', 'hijab', 'important')] });
    const r = computeCompatibility(man, woman);
    expect(r.dims.religion?.score).toBe(1);
  });

  it('keeps dimensions locked until enough shared answers', () => {
    const a = profile({ id: 'a', gender: 'male', answers: [ans('prayer', 'five_daily')] });
    const b = profile({ id: 'b', gender: 'female', answers: [ans('prayer', 'five_daily')] });
    const r = computeCompatibility(a, b);
    expect(r.dims.religion?.revealed).toBe(false);
    expect(r.dims.religion?.toReveal).toBe(2);
    expect(r.dims.timeline?.revealed).toBe(true);
  });
});

describe('dealbreakers & eligibility', () => {
  it('filters dealbreaker violations both ways', () => {
    const a = profile({ id: 'a', gender: 'male', answers: [ans('smoking', 'never', 'dealbreaker', ['never'])] });
    const b = profile({ id: 'b', gender: 'female', answers: [ans('smoking', 'regularly')] });
    expect(passesDealbreakers(a, b)).toBe(false);
    expect(checkEligibility(b, a, openEverywhere)).toEqual({ ok: false, failed: 'dealbreaker' });
  });

  it('rejects same gender and far-apart intentions', () => {
    const a = profile({ id: 'a', gender: 'male' });
    expect(checkEligibility(a, profile({ id: 'b', gender: 'male' }), openEverywhere).failed).toBe('gender');
    const b = profile({ id: 'b', gender: 'female', intention: 'unsure' });
    expect(checkEligibility(a, b, openEverywhere).failed).toBe('intention');
  });

  it('limits free users to their country when it is Open', () => {
    const a = profile({ id: 'a', gender: 'male', country: 'EG' });
    const b = profile({ id: 'b', gender: 'female', country: 'JO' });
    expect(checkEligibility(a, b, openEverywhere).failed).toBe('location');
  });

  it('uses regional pools while the country is Growing', () => {
    const growing: EligibilityContext = { now, countryStatus: () => 'growing' };
    const a = profile({ id: 'a', gender: 'male', country: 'EG' });
    expect(checkEligibility(a, profile({ id: 'b', gender: 'female', country: 'JO' }), growing).ok).toBe(true);
    expect(checkEligibility(a, profile({ id: 'c', gender: 'female', country: 'AE' }), growing).failed).toBe('location');
  });

  it('lets Passport users see the destination and locals see them', () => {
    const traveller = profile({ id: 'a', gender: 'male', country: 'GB', passport: [passport({ country: 'AE' })] });
    const local = profile({ id: 'b', gender: 'female', country: 'AE' });
    expect(checkEligibility(traveller, local, openEverywhere).ok).toBe(true);
    expect(checkEligibility(local, traveller, openEverywhere).ok).toBe(true);
  });

  it('honours international visibility settings', () => {
    const visiting = profile({ id: 'a', gender: 'male', country: 'GB', passport: [passport({ purpose: 'visiting' })] });
    const relocOnly = profile({ id: 'b', gender: 'female', country: 'AE', intlVisibility: 'relocating_only' });
    expect(checkEligibility(visiting, relocOnly, openEverywhere).failed).toBe('passport_visibility');
    const off = profile({ id: 'c', gender: 'female', country: 'AE', intlVisibility: 'off' });
    expect(checkEligibility(visiting, off, openEverywhere).failed).toBe('passport_visibility');
  });

  it('shows Travel mode users to locals only from visibleFrom', () => {
    const trip = passport({ purpose: 'visiting', visibleFrom: '2026-11-01T00:00:00Z', status: 'scheduled' });
    const traveller = profile({ id: 'a', gender: 'male', country: 'GB', passport: [trip] });
    const local = profile({ id: 'b', gender: 'female', country: 'AE' });
    expect(checkEligibility(local, traveller, openEverywhere).failed).toBe('location');
    expect(checkEligibility(traveller, local, openEverywhere).ok).toBe(true);
  });
});

describe('helpers', () => {
  it('computes country status from density and balance', () => {
    expect(computeCountryStatus(5000, 0.55)).toBe('open');
    expect(computeCountryStatus(5000, 0.75)).toBe('growing');
    expect(computeCountryStatus(500, 0.5)).toBe('growing');
  });

  it('demotes over-exposed profiles but never to zero', () => {
    expect(exposureMultiplier({ impressionsToday: 10, pendingInbound: 0 })).toBeGreaterThan(1);
    expect(exposureMultiplier({ impressionsToday: 100, pendingInbound: 0 })).toBe(1);
    const heavy = exposureMultiplier({ impressionsToday: 1000, pendingInbound: 500 });
    expect(heavy).toBeGreaterThan(0);
    expect(heavy).toBeLessThan(0.2);
  });

  it('renders reasons and discuss flags in English and gendered Arabic', () => {
    expect(renderReason({ questionKey: 'children_count', value: '3', dimension: 'children', weight: 4 }, 'en', 'male')).toBe(
      'Both want 3 children',
    );
    const flag = { questionKey: 'kids_schooling', dimension: 'children' as const, aValue: 'islamic', bValue: 'private' };
    // A man reading → the suggested question addresses a woman (feminine Arabic).
    expect(renderDiscuss(flag, 'ar', 'male').suggestion).toContain('تفضّلين');
    expect(renderDiscuss(flag, 'en', 'female').title).toBe("Discuss: Children's schooling");
  });
});
