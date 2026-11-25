import {
  QUESTIONS_BY_KEY,
  pick,
  renderDiscuss,
  renderReason,
  type DiscussFlag,
  type Gender,
  type Locale,
  type ReasonCode,
} from '@halal-meet/core';

export { renderReason };

/**
 * Wrapper around core `renderDiscuss`.
 * Workaround for a core issue: for `selfFor` questions (hijab / beard) the suggested question is
 * built from `q.text` addressed to the other person — e.g. a woman would be prompted to ask a man
 * "Do you wear hijab?". When the other person cannot answer that question about themself we use the
 * partner-preference wording instead ("What is your hijab preference for your wife?").
 */
export function renderDiscussSafe(flag: DiscussFlag, locale: Locale, viewerGender: Gender) {
  const out = renderDiscuss(flag, locale, viewerGender);
  const q = QUESTIONS_BY_KEY[flag.questionKey];
  const other: Gender = viewerGender === 'male' ? 'female' : 'male';
  if (q?.selfFor && q.selfFor !== other) {
    return { ...out, suggestion: pick(q.partnerText, locale, other) };
  }
  return out;
}

export function topReasons(reasons: ReasonCode[], locale: Locale, gender: Gender, n = 3): string[] {
  return reasons.slice(0, n).map((r) => renderReason(r, locale, gender));
}
