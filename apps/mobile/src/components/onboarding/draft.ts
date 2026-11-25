/**
 * Pure onboarding helpers: step order, dial codes, draft → API body conversion and a local
 * "profile strength" estimate. No React here so it stays easy to test.
 */
import type { Gender, HalalMode, Intention, MatchPreferencesInput, PhotoVisibility, ProfileInput } from '@halal-meet/core';

import type { IconName } from '@/components/ui';
import { ageFromBirthDate } from '@/lib/format';
import type { OnboardingDraft, OnboardingStep } from '@/state/session';

/** Steps that show the progress bar (language / welcome / ready have their own chrome). */
export const FLOW: OnboardingStep[] = [
  'phone',
  'otp',
  'intention',
  'halal-mode',
  'basics',
  'photo',
  'religion',
  'questions',
  'dealbreakers',
  'notifications',
];

/** Where "back" goes when there is no navigation history (e.g. after resuming the app mid-flow). */
export function previousStep(step: OnboardingStep): OnboardingStep | null {
  if (step === 'phone') return 'welcome';
  // Never send a signed-in user back to the phone / OTP screens.
  if (step === 'intention' || step === 'otp') return null;
  const i = FLOW.indexOf(step);
  return i > 0 ? FLOW[i - 1]! : null;
}

/** International dialling codes for the launch countries (core `COUNTRIES`). */
export const DIAL_CODES: Record<string, string> = {
  EG: '20',
  JO: '962',
  SA: '966',
  AE: '971',
  QA: '974',
  KW: '965',
  BH: '973',
  OM: '968',
  MA: '212',
  DZ: '213',
  TN: '216',
  GB: '44',
  IE: '353',
  DE: '49',
  FR: '33',
  NL: '31',
  BE: '32',
  US: '1',
  CA: '1',
};

export const INTENTIONS: Intention[] = ['within_6m', 'within_1y', 'within_2y', 'serious_getting_to_know', 'unsure'];

export const INTENTION_ICONS: Record<Intention, IconName> = {
  within_6m: 'heart',
  within_1y: 'calendar-outline',
  within_2y: 'time-outline',
  serious_getting_to_know: 'chatbubbles-outline',
  unsure: 'help-circle-outline',
};

export const HALAL_MODES: HalalMode[] = ['private', 'guided', 'wali'];

export const HALAL_MODE_ICONS: Record<HalalMode, IconName> = {
  private: 'chatbubble-ellipses-outline',
  guided: 'compass-outline',
  wali: 'people-outline',
};

export const PHOTO_VISIBILITIES: PhotoVisibility[] = ['public', 'matches', 'request', 'family'];

export const PHOTO_VISIBILITY_ICONS: Record<PhotoVisibility, IconName> = {
  public: 'globe-outline',
  matches: 'hand-left-outline',
  request: 'lock-closed-outline',
  family: 'home-outline',
};

/** What a new introduction sees for each visibility level (used for the blur / lock preview). */
export function previewPhotoState(v: PhotoVisibility): 'visible' | 'blurred' | 'locked' {
  if (v === 'public') return 'visible';
  if (v === 'family') return 'locked';
  return 'blurred';
}

export function isValidBirthDate(birthDate: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return false;
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && date <= new Date() && y >= 1920;
}

/**
 * Builds a full PUT /me/profile body from the draft. Returns null until the basics step has
 * collected the required fields (name, gender, valid birth date, country).
 */
export function buildProfileInput(d: OnboardingDraft): ProfileInput | null {
  if (!d.firstName.trim() || !d.gender || !d.country || !isValidBirthDate(d.birthDate)) return null;
  const halalMode: HalalMode = d.halalMode ?? 'guided';
  const accepted = d.acceptedModes.includes(halalMode) ? d.acceptedModes : [...d.acceptedModes, halalMode];
  return {
    firstName: d.firstName.trim(),
    gender: d.gender,
    birthDate: d.birthDate,
    nationality: d.nationality,
    country: d.country,
    city: d.city.trim(),
    languages: d.languages,
    maritalStatus: d.maritalStatus ?? 'never_married',
    hasChildren: d.children != null && d.children !== 'none',
    intention: d.intention ?? 'within_1y',
    halalMode,
    acceptedModes: HALAL_MODES.filter((m) => accepted.includes(m)),
    photoVisibility: d.photoVisibility,
    openToRelocate: false,
    relocateCountries: [],
    intlVisibility: 'on',
  };
}

/** Same defaults as the backend applies when no preferences were saved. */
export function defaultPreferences(gender: Gender, age: number): MatchPreferencesInput {
  const base = { maritalStatuses: null, acceptChildren: true, verifiedOnly: false, languages: null, dimensionImportance: {} };
  return gender === 'female'
    ? { ageMin: Math.max(18, age - 2), ageMax: age + 10, ...base }
    : { ageMin: Math.max(18, age - 10), ageMax: age + 4, ...base };
}

/** Rough local estimate of profile strength (0–100) shown in the onboarding chrome. */
export function draftStrength(d: OnboardingDraft): number {
  let s = 0;
  if (d.intention) s += 10;
  if (d.halalMode) s += 10;
  if (d.firstName.trim() && d.gender && ageFromBirthDate(d.birthDate) !== null) s += 15;
  if (d.country && d.city.trim()) s += 5;
  if (d.photoUri) s += 10;
  const answered = Object.keys(d.answers).length;
  s += Math.round((Math.min(answered, 15) / 15) * 50);
  return Math.min(100, s);
}

/**
 * Consent to process religious information (phone step). The draft has no field for it and the API
 * has no consent route yet, so it lives in memory for this session only.
 * TODO: persist server-side once the consent endpoint exists (spec 05).
 */
let religiousConsent: boolean | null = null;
export const getReligiousConsent = () => religiousConsent;
export const setReligiousConsent = (v: boolean) => {
  religiousConsent = v;
};
