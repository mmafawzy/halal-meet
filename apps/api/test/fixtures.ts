import type { Answer, Importance } from '@halal-meet/core';

export type Answers = Record<string, { self?: string | null; accept?: string[] | null; importance?: Importance }>;

export const ans = (self: string | null, accept: string[] | null = null, importance: Importance = 'important') => ({
  self,
  accept,
  importance,
});

export function toAnswers(map: Answers): Answer[] {
  return Object.entries(map).map(([questionKey, a]) => ({
    questionKey,
    self: a.self ?? null,
    accept: a.accept ?? null,
    importance: a.importance ?? 'important',
  }));
}

/** Broadly compatible answers used for the "good match" fixture. */
export const COMPATIBLE_ANSWERS: Answers = {
  prayer: ans('five_daily', ['five_daily', 'usually']),
  fasting: ans('ramadan', ['ramadan', 'ramadan_plus']),
  smoking: ans('never', ['never']),
  want_children: ans('yes', ['yes', 'maybe']),
  children_count: ans('2', ['2', '3']),
  living_arrangement: ans('independent', ['independent', 'near_parents', 'flexible']),
  spouses_working: ans('flexible', ['flexible', 'both', 'wife_choice']),
  finances: ans('joint', ['joint', 'mixed']),
  relocation: ans('within_country', ['within_country', 'anywhere']),
  conflict_style: ans('cool_off', ['cool_off', 'talk_now']),
  social_life: ans('balanced', ['balanced', 'homebody']),
  career_ambition: ans('balanced', ['balanced', 'family_first']),
  household_roles: ans('shared', ['shared', 'flexible']),
  parents_involvement: ans('moderate', ['moderate', 'high', 'low']),
};

/** Identical answers for both profiles → high mutual compatibility. */
export function compatiblePair(): Answers {
  return { ...COMPATIBLE_ANSWERS };
}
