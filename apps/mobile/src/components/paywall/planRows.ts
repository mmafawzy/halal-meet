import { PLAN_LIMITS, type PlanLimits, type PlanTier } from '@halal-meet/core';

import type { TFunction } from '@/i18n';

/** The plans compared on the paywall (spec 01 §65: Free / Plus / Gold — Elite is a concierge application). */
export const COMPARED_TIERS = ['free', 'plus', 'gold'] as const satisfies readonly PlanTier[];
export type ComparedTier = (typeof COMPARED_TIERS)[number];

export type RowKey =
  | 'dailyInterests'
  | 'topPicksPerDay'
  | 'curatedPick'
  | 'seriousInterest'
  | 'savedProfiles'
  | 'incomingInterests'
  | 'compatibilityDepth'
  | 'advancedFilters'
  | 'incognito'
  | 'undoPass'
  | 'readReceipts'
  | 'aiSuggestionsPerDay'
  | 'aiMatchmaker'
  | 'passport.included'
  | 'passport.maxDestinations'
  | 'passport.worldwide';

export const ROW_KEYS: RowKey[] = [
  'dailyInterests',
  'seriousInterest',
  'incomingInterests',
  'compatibilityDepth',
  'topPicksPerDay',
  'curatedPick',
  'savedProfiles',
  'passport.included',
  'passport.maxDestinations',
  'passport.worldwide',
  'advancedFilters',
  'incognito',
  'undoPass',
  'readReceipts',
  'aiSuggestionsPerDay',
  'aiMatchmaker',
];

/** Rows that speak to each paywall trigger, so they are listed first and highlighted. */
export const TRIGGER_ROWS: Record<string, RowKey[]> = {
  interests: ['dailyInterests'],
  serious: ['seriousInterest'],
  top_picks: ['topPicksPerDay', 'curatedPick'],
  passport: ['passport.included', 'passport.maxDestinations', 'passport.worldwide'],
  incoming: ['incomingInterests'],
  undo: ['undoPass'],
};

export interface CellValue {
  text: string;
  /** True when the plan does not offer this at all (rendered muted). */
  off: boolean;
}

const yesNo = (t: TFunction, v: boolean): CellValue => ({ text: v ? t('paywall.compare.value.yes') : t('paywall.compare.value.no'), off: !v });
const count = (t: TFunction, n: number | null, per: 'perDay' | null): CellValue =>
  n === null
    ? { text: t('paywall.compare.value.unlimited'), off: false }
    : { text: per ? t(`paywall.compare.value.${per}`, { n }) : String(n), off: n === 0 };

/** One table cell, computed from the real `PLAN_LIMITS` — never hard-coded copy. */
export function cellValue(t: TFunction, row: RowKey, l: PlanLimits): CellValue {
  switch (row) {
    case 'dailyInterests':
      return count(t, l.dailyInterests, 'perDay');
    case 'topPicksPerDay':
      return count(t, l.topPicksPerDay, 'perDay');
    case 'curatedPick':
      return yesNo(t, l.curatedPick);
    case 'seriousInterest': {
      const { count: n, windowDays } = l.seriousInterest;
      if (windowDays === 1) return { text: t('paywall.compare.value.perDay', { n }), off: false };
      if (windowDays === 7) return { text: t('paywall.compare.value.perWeek', { n }), off: false };
      return { text: t('paywall.compare.value.everyDays', { n, days: windowDays }), off: false };
    }
    case 'savedProfiles':
      return count(t, l.savedProfiles, null);
    case 'incomingInterests':
      return { text: t(l.incomingInterests === 'full' ? 'paywall.compare.value.fullList' : 'paywall.compare.value.countOnly'), off: false };
    case 'compatibilityDepth':
      return { text: t(`paywall.compare.value.depth.${l.compatibilityDepth}`), off: false };
    case 'advancedFilters':
      return yesNo(t, l.advancedFilters);
    case 'incognito':
      return yesNo(t, l.incognito);
    case 'undoPass':
      return yesNo(t, l.undoPass);
    case 'readReceipts':
      return yesNo(t, l.readReceipts);
    case 'aiSuggestionsPerDay':
      return count(t, l.aiSuggestionsPerDay, 'perDay');
    case 'aiMatchmaker':
      return yesNo(t, l.aiMatchmaker);
    case 'passport.included':
      if (l.passport.included) return { text: t('paywall.compare.value.included'), off: false };
      if (l.passport.quarterlyFreePass) return { text: t('paywall.compare.value.freePassQuarter'), off: false };
      return { text: t('paywall.compare.value.passOrAddOn'), off: false };
    case 'passport.maxDestinations':
      return l.passport.maxDestinations > 0
        ? { text: t('paywall.compare.value.destinations', { n: l.passport.maxDestinations }), off: false }
        : { text: t('paywall.compare.value.withPass'), off: false };
    case 'passport.worldwide':
      return l.passport.worldwide ? { text: t('paywall.compare.value.worldwide'), off: false } : yesNo(t, false);
  }
}

export function rowLabel(t: TFunction, row: RowKey): string {
  return t(`paywall.compare.row.${row}`);
}

export function orderedRows(trigger: string): { rows: RowKey[]; highlighted: Set<RowKey> } {
  const first = TRIGGER_ROWS[trigger] ?? [];
  return { rows: [...first, ...ROW_KEYS.filter((r) => !first.includes(r))], highlighted: new Set(first) };
}

export const limitsFor = (tier: ComparedTier): PlanLimits => PLAN_LIMITS[tier];
