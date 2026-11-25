/** Rough country → IANA timezone map (one zone per country is enough for daily resets). */
export const COUNTRY_TZ: Record<string, string> = {
  EG: 'Africa/Cairo',
  JO: 'Asia/Amman',
  SA: 'Asia/Riyadh',
  AE: 'Asia/Dubai',
  QA: 'Asia/Qatar',
  KW: 'Asia/Kuwait',
  BH: 'Asia/Bahrain',
  OM: 'Asia/Muscat',
  MA: 'Africa/Casablanca',
  DZ: 'Africa/Algiers',
  TN: 'Africa/Tunis',
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  NL: 'Europe/Amsterdam',
  BE: 'Europe/Brussels',
  US: 'America/New_York',
  CA: 'America/Toronto',
};

export const DAY_MS = 86_400_000;

export function tzForCountry(country: string | null | undefined): string {
  return (country && COUNTRY_TZ[country]) || 'UTC';
}

function localParts(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { y: get('year'), m: get('month'), d: get('day'), h: get('hour'), mi: get('minute'), s: get('second') };
}

/** Offset of `tz` from UTC at `date`, in ms (positive east of Greenwich). */
export function tzOffsetMs(date: Date, tz: string): number {
  const p = localParts(date, tz);
  const asUtc = Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Local calendar date (YYYY-MM-DD) in `tz`. */
export function localDate(date: Date, tz: string): string {
  const p = localParts(date, tz);
  return `${p.y}-${String(p.m).padStart(2, '0')}-${String(p.d).padStart(2, '0')}`;
}

/** UTC instant of the most recent local midnight in `tz`. */
export function localDayStart(date: Date, tz: string): Date {
  const p = localParts(date, tz);
  return new Date(Date.UTC(p.y, p.m - 1, p.d) - tzOffsetMs(date, tz));
}

/** UTC instant of the next local midnight in `tz`. */
export function nextLocalMidnight(date: Date, tz: string): Date {
  const start = localDayStart(date, tz);
  // Jump into the middle of the next day and take its local midnight (robust to DST changes).
  return localDayStart(new Date(start.getTime() + DAY_MS + 3 * 3_600_000), tz);
}

export function ageFromBirthDate(birthDate: string, now = new Date()): number {
  const [y, m, d] = birthDate.split('-').map(Number) as [number, number, number];
  let age = now.getUTCFullYear() - y;
  const month = now.getUTCMonth() + 1;
  if (month < m || (month === m && now.getUTCDate() < d)) age -= 1;
  return age;
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** End of a calendar date (23:59:59.999 UTC). */
export function endOfDateUtc(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}
