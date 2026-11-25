import { COUNTRIES_BY_CODE, type Locale } from '@halal-meet/core';

import { cityLabel } from './cities';

export function greetingKey(date = new Date()): 'morning' | 'afternoon' | 'evening' {
  const h = date.getHours();
  if (h >= 4 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

export function ageFromBirthDate(birthDate: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) return null;
  const b = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(b.getTime())) return null;
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

export function countryName(code: string, locale: Locale): string {
  const c = COUNTRIES_BY_CODE[code];
  return c ? c.name[locale] : code;
}

export function countryFlag(code: string): string {
  return COUNTRIES_BY_CODE[code]?.flag ?? '🌍';
}

/** "New Cairo 🇪🇬" style label. */
export function placeLabel(country: string, city: string, locale: Locale): string {
  return `${cityLabel(country, city, locale)} ${countryFlag(country)}`;
}

/** Formats minor units (e.g. 1499) as a localised price. */
export function formatPrice(minor: number, locale: Locale, currency = 'USD'): string {
  const value = minor / 100;
  try {
    return new Intl.NumberFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

export function formatDate(iso: string | null | undefined, locale: Locale, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  try {
    return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-EG-u-nu-latn' : 'en-GB', opts).format(d);
  } catch {
    return d.toDateString();
  }
}

export function formatTime(iso: string, locale: Locale): string {
  return formatDate(iso, locale, { hour: '2-digit', minute: '2-digit' });
}

/** Hours / minutes until an ISO timestamp (never negative). */
export function timeUntil(iso: string, now = new Date()): { h: number; m: number } {
  const ms = Math.max(0, new Date(iso).getTime() - now.getTime());
  const totalMin = Math.ceil(ms / 60000);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

/** Compact relative time: { key, n } for i18n (`common.time.*`). */
export function relativeTime(iso: string, now = new Date()): { key: 'justNow' | 'minutes' | 'hours' | 'days'; n: number } {
  const diff = Math.max(0, now.getTime() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return { key: 'justNow', n: 0 };
  if (min < 60) return { key: 'minutes', n: min };
  const h = Math.floor(min / 60);
  if (h < 24) return { key: 'hours', n: h };
  return { key: 'days', n: Math.floor(h / 24) };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '·';
  const first = Array.from(parts[0]!)[0] ?? '';
  const second = parts.length > 1 ? (Array.from(parts[parts.length - 1]!)[0] ?? '') : '';
  return (first + second).toUpperCase();
}
