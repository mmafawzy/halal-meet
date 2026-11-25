export type Locale = 'en' | 'ar';
export type Gender = 'male' | 'female';

export type Intention =
  | 'within_6m'
  | 'within_1y'
  | 'within_2y'
  | 'serious_getting_to_know'
  | 'unsure';

export type HalalMode = 'private' | 'guided' | 'wali';

export type MaritalStatus = 'never_married' | 'divorced' | 'widowed' | 'annulled';

export type Importance = 'dealbreaker' | 'must' | 'important' | 'flexible';

export type Dimension =
  | 'religion'
  | 'family'
  | 'children'
  | 'lifestyle'
  | 'finance'
  | 'career'
  | 'timeline'
  | 'location'
  | 'language';

export type PhotoVisibility = 'public' | 'matches' | 'request' | 'family';
export type IntlVisibility = 'on' | 'relocating_only' | 'off';

export type PlanTier = 'free' | 'plus' | 'gold' | 'elite';

export type VerificationKind = 'phone' | 'identity' | 'profession' | 'education' | 'marital' | 'family';

/** Localized text. Arabic has masculine/feminine forms addressed to the viewer. */
export interface LocalizedText {
  en: string;
  ar_m: string;
  ar_f: string;
}

/** A single answer a user has given to a compatibility question. */
export interface Answer {
  questionKey: string;
  /** The user's own answer: an option value (or several for multi-select). Null if they only set a preference. */
  self: string | string[] | null;
  /** Option values the user would accept in a spouse. Null = no explicit preference. */
  accept: string[] | null;
  importance: Importance;
}

export type PassportPurpose = 'relocate' | 'moving' | 'visiting' | 'spouse_relocates_to_me' | 'either';

export interface PassportDestination {
  id: string;
  country: string; // ISO-3166 alpha-2
  city: string | null;
  purpose: PassportPurpose;
  visitFrom: string | null; // ISO date
  visitTo: string | null;
  /** When locals at the destination start seeing this user (Travel mode starts 14 days early). */
  visibleFrom: string;
  activeUntil: string | null;
  status: 'scheduled' | 'active' | 'expired' | 'cancelled';
  isWorldwide: boolean;
}

/** Everything the matching engine needs to know about one member. */
export interface MatchProfile {
  id: string;
  gender: Gender;
  age: number;
  country: string;
  city: string;
  languages: string[];
  maritalStatus: MaritalStatus;
  hasChildren: boolean;
  intention: Intention;
  halalMode: HalalMode;
  acceptedModes: HalalMode[];
  identityVerified: boolean;
  openToRelocate: boolean;
  relocateCountries: string[];
  intlVisibility: IntlVisibility;
  answers: Answer[];
  /** Importance the user gave each dimension (values grid). Missing = 'important'. */
  dimensionImportance: Partial<Record<Dimension, Importance>>;
  preferences: MatchPreferences;
  /** Active or scheduled Passport destinations (only if entitled). */
  passport: PassportDestination[];
}

export interface MatchPreferences {
  ageMin: number;
  ageMax: number;
  maritalStatuses: MaritalStatus[] | null; // null = any
  acceptChildren: boolean;
  verifiedOnly: boolean;
  languages: string[] | null; // null = any
}

export interface ReasonCode {
  questionKey: string;
  /** Shared option value both users are aligned on (if any). */
  value: string | null;
  dimension: Dimension;
  weight: number;
}

export interface DiscussFlag {
  questionKey: string;
  dimension: Dimension;
  aValue: string | null;
  bValue: string | null;
}

export interface DimensionScore {
  score: number; // 0..1, mutual (geometric mean)
  revealed: boolean;
  /** Questions both answered in this dimension. */
  sharedCount: number;
  /** How many more shared answers are needed to reveal (0 if revealed). */
  toReveal: number;
}

export interface CompatibilityResult {
  overall: number; // 0..1 mutual
  displayPct: number; // 0..100
  dims: Partial<Record<Dimension, DimensionScore>>;
  reasons: ReasonCode[];
  discuss: DiscussFlag[];
  algoVersion: string;
}

export interface EligibilityResult {
  ok: boolean;
  /** First failing rule, for debugging and "why am I not seeing X" tooling. */
  failed?: EligibilityRule;
}

export type EligibilityRule =
  | 'gender'
  | 'age'
  | 'location'
  | 'passport_visibility'
  | 'intention'
  | 'halal_mode'
  | 'dealbreaker'
  | 'marital'
  | 'children'
  | 'verification'
  | 'language';
