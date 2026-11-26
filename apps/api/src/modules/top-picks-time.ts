import { eq } from 'drizzle-orm';
import { DEFAULT_NOTIFICATION_PREFS, QUIET_HOURS } from '@halal-meet/core';
import type { Db } from '../db/client';
import * as t from '../db/schema';
import { DAY_MS, localDate, localDayStart, nextLocalMidnight, tzForCountry } from '../common/time';

/**
 * Approximate local Maghrib per country (HH:MM, rough yearly mean for the main city).
 *
 * We do not have prayer-time data yet, so "after Maghrib" (spec 01 §20, spec 02 §2: default 30 min after local
 * Maghrib) is approximated by a fixed local evening time per country plus 30 minutes. Real Maghrib moves by up to
 * ±1.5 h over the year; replace this table with a prayer-time calculation (lat/long per city) when available.
 */
export const MAGHRIB_APPROX: Record<string, string> = {
  EG: '17:45',
  JO: '17:45',
  SA: '18:00',
  AE: '18:30',
  QA: '17:45',
  KW: '17:45',
  BH: '17:45',
  OM: '18:15',
  MA: '19:00',
  DZ: '18:45',
  TN: '18:30',
  GB: '18:15',
  IE: '18:30',
  DE: '18:30',
  FR: '19:00',
  NL: '18:45',
  BE: '18:45',
  US: '18:15',
  CA: '18:15',
};
const DEFAULT_MAGHRIB = '18:15';
/** Minutes after Maghrib that Top Picks refresh by default. */
export const AFTER_MAGHRIB_MIN = 30;

const toMinutes = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Minutes after local midnight at which Top Picks refresh for this preference. */
export function topPicksMinuteOfDay(pref: string | null | undefined, country: string | null | undefined): number {
  const p = pref ?? 'maghrib';
  if (p === 'morning') return 8 * 60;
  if (p === 'evening') return 21 * 60;
  if (/^\d{2}:\d{2}$/.test(p)) return toMinutes(p);
  return toMinutes((country && MAGHRIB_APPROX[country]) || DEFAULT_MAGHRIB) + AFTER_MAGHRIB_MIN;
}

export interface TopPicksCycle {
  /** Key for `top_picks.pick_date`: the local date on which the current cycle started. */
  day: string;
  startsAt: Date;
  refreshesAt: Date;
}

/** The Top Picks cycle `now` falls in: from the latest local refresh time to the next one. */
export function topPicksCycle(now: Date, country: string | null | undefined, pref: string | null | undefined): TopPicksCycle {
  const tz = tzForCountry(country);
  const offset = topPicksMinuteOfDay(pref, country) * 60_000;
  const today = new Date(localDayStart(now, tz).getTime() + offset);
  if (now.getTime() >= today.getTime()) {
    const tomorrow = new Date(nextLocalMidnight(now, tz).getTime() + offset);
    return { day: localDate(today, tz), startsAt: today, refreshesAt: tomorrow };
  }
  // Before today's refresh: the cycle started yesterday evening.
  const yesterdayStart = localDayStart(new Date(localDayStart(now, tz).getTime() - DAY_MS / 2), tz);
  const yesterday = new Date(yesterdayStart.getTime() + offset);
  return { day: localDate(yesterday, tz), startsAt: yesterday, refreshesAt: today };
}

/** Looks up the member's country and Top Picks time, then returns their current cycle. */
export async function topPicksCycleFor(db: Db, accountId: string, now = new Date()): Promise<TopPicksCycle> {
  const [row] = await db
    .select({ country: t.profiles.country, pref: t.notificationPrefs.topPicksTime })
    .from(t.profiles)
    .leftJoin(t.notificationPrefs, eq(t.notificationPrefs.accountId, t.profiles.accountId))
    .where(eq(t.profiles.accountId, accountId));
  return topPicksCycle(now, row?.country ?? null, row?.pref ?? DEFAULT_NOTIFICATION_PREFS.topPicksTime);
}

/** Local minute-of-day in `tz`. */
export function localMinuteOfDay(now: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (k: string) => Number(parts.find((p) => p.type === k)?.value ?? 0);
  return get('hour') * 60 + get('minute');
}

/** True inside the 23:00–08:00 local quiet window. */
export function inQuietHours(now: Date, country: string | null | undefined): boolean {
  const m = localMinuteOfDay(now, tzForCountry(country));
  return m >= toMinutes(QUIET_HOURS.start) || m < toMinutes(QUIET_HOURS.end);
}
