import type { HalalMode, JourneyStage } from '@halal-meet/core';

/** Halal Mode guided boundaries (spec README glossary): photos from stage 3, contact details from stage 4. */
export const CONTACT_STAGE: JourneyStage = 4;
export const PHOTO_STAGE: JourneyStage = 3;

/** Guided boundaries apply when either person chose Guided or Wali / Family mode. */
export function guidedApplies(mine: HalalMode | undefined, theirs: HalalMode | undefined): boolean {
  return mine === 'guided' || mine === 'wali' || theirs === 'guided' || theirs === 'wali';
}

const CONTACT_WORDS =
  /\b(whats\s*app|telegram|snap(chat)?|instagram|insta|signal|wechat|viber|e-?mail|my number|phone number|call me on|text me on)\b|واتس|واتساب|تيليجرام|تلجرام|سناب|انستا|إنستغرام|رقمي|رقم هاتفي|رقم جوالي|ايميلي|إيميلي/i;
const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
/** 9+ digits, allowing spaces / dashes / a leading +, Western or Eastern Arabic numerals. */
const PHONE = /\+?[\d٠-٩][\d٠-٩\s-]{6,}[\d٠-٩]/g;

function hasPhoneNumber(text: string): boolean {
  return (text.match(PHONE) ?? []).some((m) => m.replace(/[^\d٠-٩]/g, '').length >= 9);
}

/** True when a draft message looks like it shares contact details or asks to move off the platform. */
export function looksLikeContact(text: string): boolean {
  return CONTACT_WORDS.test(text) || EMAIL.test(text) || hasPhoneNumber(text);
}
