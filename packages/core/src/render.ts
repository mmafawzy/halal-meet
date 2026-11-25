import { DERIVED_KEYS } from './compatibility';
import { QUESTIONS_BY_KEY } from './questions';
import type { DiscussFlag, Gender, Locale, LocalizedText, ReasonCode } from './types';

/** Picks the right string for a locale; Arabic is gendered by the viewer (the person reading). */
export function pick(text: LocalizedText, locale: Locale, viewerGender: Gender): string {
  if (locale === 'en') return text.en;
  return viewerGender === 'female' ? text.ar_f : text.ar_m;
}

const DERIVED_TEXT: Record<string, LocalizedText> = {
  [DERIVED_KEYS.timeline]: { en: 'Similar marriage timeline', ar_m: 'توقيت زواج متقارب', ar_f: 'توقيت زواج متقارب' },
  [DERIVED_KEYS.language]: { en: 'You share a language', ar_m: 'لغة مشتركة بينكما', ar_f: 'لغة مشتركة بينكما' },
  [DERIVED_KEYS.location]: { en: 'Location works for both of you', ar_m: 'الموقع مناسب لكليكما', ar_f: 'الموقع مناسب لكليكما' },
};

export function optionLabel(questionKey: string, value: string, locale: Locale, viewerGender: Gender): string {
  const opt = QUESTIONS_BY_KEY[questionKey]?.options.find((o) => o.value === value);
  return opt ? pick(opt.label, locale, viewerGender) : value;
}

export function renderReason(r: ReasonCode, locale: Locale, viewerGender: Gender): string {
  const derived = DERIVED_TEXT[r.questionKey];
  if (derived) return pick(derived, locale, viewerGender);

  const q = QUESTIONS_BY_KEY[r.questionKey];
  if (!q) return r.questionKey;
  if (q.aligned && (r.value || !q.aligned.en.includes('{value}'))) {
    const label = r.value ? optionLabel(q.key, r.value, locale, viewerGender) : '';
    return pick(q.aligned, locale, viewerGender).replace('{value}', label.toLowerCase());
  }
  const topic = pick(q.topic, locale, viewerGender);
  return locale === 'en' ? `Aligned on ${topic.toLowerCase()}` : `توافق في ${topic}`;
}

export interface RenderedDiscuss {
  title: string;
  /** A question the viewer can send. Addressed to the other person, so Arabic uses the other gender. */
  suggestion: string;
}

export function renderDiscuss(f: DiscussFlag, locale: Locale, viewerGender: Gender): RenderedDiscuss {
  const q = QUESTIONS_BY_KEY[f.questionKey];
  if (!q) return { title: f.questionKey, suggestion: '' };
  const topic = pick(q.topic, locale, viewerGender);
  const otherGender: Gender = viewerGender === 'male' ? 'female' : 'male';
  return {
    title: locale === 'en' ? `Discuss: ${topic}` : `للنقاش: ${topic}`,
    suggestion: pick(q.text, locale, otherGender),
  };
}
