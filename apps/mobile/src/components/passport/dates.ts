/** Date helpers for Passport / Travel mode (dates are plain ISO `YYYY-MM-DD`, local time). */

/** Travel mode: locals at the destination start seeing a visitor this many days before arrival. */
export const TRAVEL_LEAD_DAYS = 14;

/** A 7-day pass covers a Travel-mode trip of up to this many days (spec 01 §73). */
export const PASS_MAX_TRIP_DAYS = 30;

/** Below this, warn before a purchase (spec 01 §73). */
export const LOW_COUNT_WARNING = 50;

const DAY = 86_400_000;

export function toIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}

export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  // Rejects 2027-02-31 and friends (Date would roll them over).
  if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
  return d;
}

export function isValidIsoDate(iso: string): boolean {
  return parseIsoDate(iso) !== null;
}

/** Whole days from `a` to `b` (both ISO). */
export function daysBetween(a: string, b: string): number {
  const da = parseIsoDate(a);
  const db = parseIsoDate(b);
  if (!da || !db) return 0;
  return Math.round((db.getTime() - da.getTime()) / DAY);
}

/** When locals start seeing a visitor arriving on `visitFrom` (never earlier than today). */
export function visibleFromIso(visitFrom: string): string {
  const d = parseIsoDate(visitFrom);
  if (!d) return todayIso();
  const lead = new Date(d.getTime() - TRAVEL_LEAD_DAYS * DAY);
  const today = parseIsoDate(todayIso())!;
  return toIsoDate(lead > today ? lead : today);
}
