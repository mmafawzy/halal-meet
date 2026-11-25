import { QUESTIONS, type MyProfile } from '@halal-meet/core';

export type StrengthLevel = 'basic' | 'good' | 'strong' | 'excellent';

export function strengthLevel(pct: number): StrengthLevel {
  if (pct >= 85) return 'excellent';
  if (pct >= 65) return 'strong';
  if (pct >= 40) return 'good';
  return 'basic';
}

export type MissingItem = 'photo' | 'about' | 'identity' | 'profession' | 'questions' | 'guardian';

/** What is still missing from the profile, most valuable first (spec 01 §56). */
export function missingItems(
  p: MyProfile,
  opts: { hasPhoto: boolean; answersCount: number; hasGuardian: boolean },
): MissingItem[] {
  const out: MissingItem[] = [];
  if (!opts.hasPhoto) out.push('photo');
  if (!p.about?.trim()) out.push('about');
  if (!p.verifications.includes('identity')) out.push('identity');
  if (!p.verifications.includes('profession')) out.push('profession');
  if (opts.answersCount < QUESTIONS.length) out.push('questions');
  if (!opts.hasGuardian) out.push('guardian');
  return out;
}
