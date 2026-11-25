/**
 * Deterministic seeded population for the mock backend.
 * ~170 members: about half live in the signed-in user's country (so Discover is rich wherever the
 * demo user says they live), the rest are spread across core COUNTRIES (Passport destinations).
 */
import {
  COUNTRIES,
  QUESTIONS,
  canAnswerSelf,
  canSetPreference,
  type Answer,
  type Dimension,
  type Gender,
  type HalalMode,
  type Importance,
  type Intention,
  type MaritalStatus,
  type MatchProfile,
  type PassportDestination,
  type PassportPurpose,
  type QuestionDef,
  type VerificationKind,
} from '@halal-meet/core';

import { CITIES } from '../../lib/cities';
import { ABOUT, EDUCATION, FEMALE_NAMES, MALE_NAMES, PROFESSIONS } from './content';
import { Rng } from './rng';

export interface SeedProfile {
  id: string;
  name: [string, string]; // [latin, arabic]
  professionIdx: number;
  educationIdx: number;
  aboutIdx: number;
  photoState: 'visible' | 'blurred' | 'locked';
  verifications: VerificationKind[];
  joinedAt: string;
  /** Feed-ranking helpers (0..1). */
  responsiveness: number;
  pMutual: number;
  keyFacts: Array<{ questionKey: string; value: string }>;
  match: MatchProfile;
}

const COUNTRY_WEIGHTS: Record<string, number> = {
  EG: 10, SA: 9, AE: 9, GB: 8, US: 6, JO: 4, QA: 3, KW: 3, MA: 4, DZ: 3, TN: 2, DE: 4, FR: 4, CA: 4,
  NL: 2, BE: 2, IE: 1, BH: 1, OM: 1,
};

const LANGS_BY_COUNTRY: Record<string, string[][]> = {
  GB: [['en'], ['en', 'ar'], ['en', 'ur']],
  IE: [['en'], ['en', 'ar']],
  US: [['en'], ['en', 'ar'], ['en', 'ur'], ['en', 'so']],
  CA: [['en'], ['en', 'fr'], ['en', 'ar']],
  DE: [['de', 'ar'], ['de', 'tr'], ['de', 'en']],
  FR: [['fr', 'ar'], ['fr'], ['fr', 'en']],
  NL: [['nl', 'ar'], ['nl', 'tr'], ['nl', 'en']],
  BE: [['fr', 'ar'], ['nl', 'ar'], ['fr', 'nl']],
  MA: [['ar', 'fr'], ['ar']],
  DZ: [['ar', 'fr'], ['ar']],
  TN: [['ar', 'fr'], ['ar']],
};

function languagesFor(country: string, rng: Rng): string[] {
  const opts = LANGS_BY_COUNTRY[country];
  if (opts) return rng.pick(opts);
  return rng.chance(0.55) ? ['ar', 'en'] : ['ar'];
}

function isoDate(d: Date): string {
  return d.toISOString();
}

function answerFor(q: QuestionDef, gender: Gender, rng: Rng, devout: number): Answer | null {
  const n = q.options.length;
  const importance: Importance = rng.weighted<Importance>([
    ['flexible', 25],
    ['important', 45],
    ['must', 22],
    ['dealbreaker', 8],
  ]);
  let self: string | null = null;
  if (canAnswerSelf(q, gender)) {
    let idx: number;
    if (q.type === 'ordinal') {
      // devout ∈ [0,1]: 1 → first (most practising / most "yes") option
      const target = (1 - devout) * (n - 1);
      idx = Math.max(0, Math.min(n - 1, Math.round(target + (rng.float() - 0.5) * 1.6)));
    } else {
      idx = rng.int(0, n - 1);
    }
    // "prefer not to say" style options are rare
    if (q.options[idx]!.value === 'prefer_not' && rng.chance(0.7)) idx = 0;
    self = q.options[idx]!.value;
  }

  let accept: string[] | null = null;
  const wantsPref = canSetPreference(q, gender) && (self === null || rng.chance(0.5) || importance === 'dealbreaker');
  if (wantsPref) {
    if (q.type === 'ordinal') {
      const center = self !== null ? q.options.findIndex((o) => o.value === self) : Math.round((1 - devout) * (n - 1));
      const spread = importance === 'flexible' ? 2 : 1;
      accept = q.options.filter((_, i) => Math.abs(i - center) <= spread).map((o) => o.value);
    } else {
      const base = self ?? rng.pick(q.options).value;
      const extras = q.options.filter((o) => o.value !== base && rng.chance(0.45)).map((o) => o.value);
      accept = [base, ...extras];
    }
  }
  if (self === null && accept === null) return null;
  return { questionKey: q.key, self, accept, importance };
}

export interface SeedOptions {
  homeCountry: string;
  viewerGender: Gender;
  count?: number;
  now?: Date;
}

export function generateSeeds({ homeCountry, viewerGender, count = 170, now = new Date() }: SeedOptions): SeedProfile[] {
  const rng = new Rng(`halal-meet:${homeCountry}:${viewerGender}`);
  const otherGender: Gender = viewerGender === 'male' ? 'female' : 'male';
  const abroad = COUNTRIES.filter((c) => c.code !== homeCountry).map((c) => [c.code, COUNTRY_WEIGHTS[c.code] ?? 1] as const);
  const seeds: SeedProfile[] = [];
  const usedNames = new Map<string, number>();

  for (let i = 0; i < count; i++) {
    const gender: Gender = rng.chance(0.78) ? otherGender : viewerGender;
    const atHome = rng.chance(0.52);
    const country = atHome ? homeCountry : rng.weighted(abroad);
    const city = rng.pick(CITIES[country] ?? [{ en: 'Capital', ar: 'العاصمة' }]).en;
    const names = gender === 'male' ? MALE_NAMES : FEMALE_NAMES;
    const name = rng.pick(names);
    usedNames.set(name[0], (usedNames.get(name[0]) ?? 0) + 1);

    const age = gender === 'female' ? rng.int(21, 36) : rng.int(23, 40);
    const devout = Math.min(1, Math.max(0, rng.float() * 0.8 + 0.2));
    const intention = rng.weighted<Intention>([
      ['within_6m', 18],
      ['within_1y', 38],
      ['within_2y', 26],
      ['serious_getting_to_know', 12],
      ['unsure', 6],
    ]);
    const halalMode = rng.weighted<HalalMode>([
      ['private', 35],
      ['guided', 45],
      ['wali', 20],
    ]);
    const acceptedModes: HalalMode[] = rng.chance(0.82)
      ? ['private', 'guided', 'wali']
      : halalMode === 'private'
        ? ['private', 'guided']
        : halalMode === 'wali'
          ? ['guided', 'wali']
          : ['private', 'guided', 'wali'];
    const maritalStatus = rng.weighted<MaritalStatus>([
      ['never_married', 80],
      ['divorced', 14],
      ['widowed', 3],
      ['annulled', 3],
    ]);
    const hasChildren = maritalStatus !== 'never_married' && rng.chance(0.45);

    const answers: Answer[] = [];
    for (const q of QUESTIONS) {
      if (!q.starter && !rng.chance(0.8)) continue;
      const a = answerFor(q, gender, rng, devout);
      if (a) answers.push(a);
    }

    const verifications: VerificationKind[] = ['phone'];
    const identityVerified = rng.chance(0.62);
    if (identityVerified) verifications.push('identity');
    if (rng.chance(0.15)) verifications.push('family');
    if (rng.chance(0.2)) verifications.push('profession');
    if (rng.chance(0.14)) verifications.push('education');
    if (maritalStatus !== 'never_married' && rng.chance(0.3)) verifications.push('marital');

    const dimensionImportance: Partial<Record<Dimension, Importance>> = {};
    if (rng.chance(0.6)) dimensionImportance.religion = rng.pick<Importance>(['must', 'important', 'dealbreaker']);
    if (rng.chance(0.4)) dimensionImportance.family = rng.pick<Importance>(['must', 'important']);
    if (rng.chance(0.3)) dimensionImportance.location = rng.pick<Importance>(['important', 'flexible']);

    const ageMin = gender === 'female' ? Math.max(18, age - 2) : Math.max(18, age - 10);
    const ageMax = gender === 'female' ? age + 10 : age + 3;

    const openToRelocate = rng.chance(country === homeCountry ? 0.25 : 0.45);
    const passport: PassportDestination[] = [];
    // ~1 in 7 members abroad is using Passport towards the viewer's home country.
    if (country !== homeCountry && rng.chance(0.15)) {
      const purpose = rng.weighted<PassportPurpose>([
        ['relocate', 3],
        ['moving', 2],
        ['visiting', 3],
        ['either', 1],
      ]);
      const visitFrom = purpose === 'visiting' ? new Date(now.getTime() + rng.int(5, 40) * 86400000) : null;
      const visitTo = visitFrom ? new Date(visitFrom.getTime() + rng.int(10, 21) * 86400000) : null;
      const movingDate = purpose === 'moving' ? new Date(now.getTime() + rng.int(60, 300) * 86400000) : null;
      passport.push({
        id: `pp_seed_${i}`,
        country: homeCountry,
        city: null,
        purpose,
        visitFrom: visitFrom ? isoDate(visitFrom).slice(0, 10) : movingDate ? isoDate(movingDate).slice(0, 10) : null,
        visitTo: visitTo ? isoDate(visitTo).slice(0, 10) : null,
        visibleFrom: isoDate(visitFrom ? new Date(Math.min(now.getTime(), visitFrom.getTime() - 14 * 86400000)) : new Date(now.getTime() - 86400000)),
        activeUntil: visitTo ? isoDate(visitTo) : null,
        status: 'active',
        isWorldwide: false,
      });
    }

    const keyFacts = rng.chance(0.45)
      ? answers
          .filter((a) => typeof a.self === 'string' && (a.importance === 'must' || a.importance === 'dealbreaker'))
          .slice(0, 5)
          .map((a) => ({ questionKey: a.questionKey, value: a.self as string }))
      : [];

    const joinedDaysAgo = rng.chance(0.14) ? rng.int(0, 2) : rng.int(4, 200);

    const id = `u_${(i + 1).toString().padStart(3, '0')}`;
    seeds.push({
      id,
      name,
      professionIdx: rng.int(0, PROFESSIONS.length - 1),
      educationIdx: rng.int(0, EDUCATION.length - 1),
      aboutIdx: rng.int(0, ABOUT.length - 1),
      photoState: rng.weighted<'visible' | 'blurred' | 'locked'>([
        ['visible', 35],
        ['blurred', 45],
        ['locked', 20],
      ]),
      verifications,
      joinedAt: isoDate(new Date(now.getTime() - joinedDaysAgo * 86400000 - rng.int(0, 86400000))),
      responsiveness: 0.4 + rng.float() * 0.6,
      pMutual: 0.2 + rng.float() * 0.6,
      keyFacts,
      match: {
        id,
        gender,
        age,
        country,
        city,
        languages: languagesFor(country, rng),
        maritalStatus,
        hasChildren,
        intention,
        halalMode,
        acceptedModes: acceptedModes.includes(halalMode) ? acceptedModes : [...acceptedModes, halalMode],
        identityVerified,
        openToRelocate,
        relocateCountries: [],
        intlVisibility: rng.weighted([
          ['on', 70],
          ['relocating_only', 20],
          ['off', 10],
        ] as const),
        answers,
        dimensionImportance,
        preferences: {
          ageMin,
          ageMax,
          maritalStatuses: rng.chance(0.25) ? ['never_married'] : null,
          acceptChildren: rng.chance(0.85),
          verifiedOnly: rng.chance(0.08),
          languages: null,
        },
        passport,
      },
    });
  }
  return seeds;
}
