import type { PlanTier } from './types';

export interface PlanLimits {
  /** "I'm interested" per day. null = unlimited. */
  dailyInterests: number | null;
  topPicksPerDay: number;
  curatedPick: boolean;
  seriousInterest: { count: number; windowDays: number };
  savedProfiles: number | null;
  incomingInterests: 'count' | 'full';
  compatibilityDepth: 'basic' | 'full' | 'ai';
  advancedFilters: boolean;
  incognito: boolean;
  undoPass: boolean;
  readReceipts: boolean;
  /** AI conversation suggestions per day. null = unlimited. */
  aiSuggestionsPerDay: number | null;
  aiMatchmaker: boolean;
  passport: {
    included: boolean;
    maxDestinations: number;
    worldwide: boolean;
    /** Plus gets one free 7-day pass per quarter. */
    quarterlyFreePass: boolean;
  };
}

export const PLAN_LIMITS: Record<PlanTier, PlanLimits> = {
  free: {
    dailyInterests: 10,
    topPicksPerDay: 3,
    curatedPick: false,
    seriousInterest: { count: 1, windowDays: 7 },
    savedProfiles: 20,
    incomingInterests: 'count',
    compatibilityDepth: 'basic',
    advancedFilters: false,
    incognito: false,
    undoPass: false,
    readReceipts: false,
    aiSuggestionsPerDay: 3,
    aiMatchmaker: false,
    passport: { included: false, maxDestinations: 0, worldwide: false, quarterlyFreePass: false },
  },
  plus: {
    dailyInterests: null,
    topPicksPerDay: 6,
    curatedPick: false,
    seriousInterest: { count: 3, windowDays: 7 },
    savedProfiles: null,
    incomingInterests: 'full',
    compatibilityDepth: 'full',
    advancedFilters: true,
    incognito: true,
    undoPass: true,
    readReceipts: true,
    aiSuggestionsPerDay: 10,
    aiMatchmaker: false,
    passport: { included: false, maxDestinations: 0, worldwide: false, quarterlyFreePass: true },
  },
  gold: {
    dailyInterests: null,
    topPicksPerDay: 10,
    curatedPick: true,
    seriousInterest: { count: 1, windowDays: 1 },
    savedProfiles: null,
    incomingInterests: 'full',
    compatibilityDepth: 'ai',
    advancedFilters: true,
    incognito: true,
    undoPass: true,
    readReceipts: true,
    aiSuggestionsPerDay: null,
    aiMatchmaker: true,
    passport: { included: true, maxDestinations: 3, worldwide: true, quarterlyFreePass: false },
  },
  elite: {
    dailyInterests: null,
    topPicksPerDay: 10,
    curatedPick: true,
    seriousInterest: { count: 1, windowDays: 1 },
    savedProfiles: null,
    incomingInterests: 'full',
    compatibilityDepth: 'ai',
    advancedFilters: true,
    incognito: true,
    undoPass: true,
    readReceipts: true,
    aiSuggestionsPerDay: null,
    aiMatchmaker: true,
    passport: { included: true, maxDestinations: 3, worldwide: true, quarterlyFreePass: false },
  },
};

export type Sku = 'plus_monthly' | 'gold_monthly' | 'passport_pass_7d' | 'passport_addon_monthly';

/** US anchor prices (minor units). Regional prices come from the store/pricing service. */
export const SKU_PRICES_USD: Record<Sku, number> = {
  plus_monthly: 1499,
  gold_monthly: 2999,
  passport_pass_7d: 499,
  passport_addon_monthly: 799,
};

/** How many Passport destinations a user may have active at once given plan + add-ons. */
export function passportCapacity(tier: PlanTier, hasPassportAddon: boolean, hasActivePass: boolean): number {
  const included = PLAN_LIMITS[tier].passport.maxDestinations;
  if (included > 0) return included;
  return hasPassportAddon || hasActivePass ? 1 : 0;
}
