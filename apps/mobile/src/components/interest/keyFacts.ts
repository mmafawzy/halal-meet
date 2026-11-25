import { optionLabel, pick, QUESTIONS_BY_KEY, type ProfileCard } from '@halal-meet/core';

import { useLocale, useViewerGender } from '@/i18n';

export type AbymResponse = 'compatible' | 'not_compatible' | 'discuss';
export type AbymAnswers = Record<string, AbymResponse>;

/** Renders a key fact as { topic, value } in the viewer's language ("Children" · "Two or three"). */
export function useKeyFactText() {
  const locale = useLocale();
  const gender = useViewerGender();
  return (fact: ProfileCard['keyFacts'][number]): { topic: string; value: string } => {
    const q = QUESTIONS_BY_KEY[fact.questionKey];
    return {
      topic: q ? pick(q.topic, locale, gender) : fact.questionKey,
      value: optionLabel(fact.questionKey, fact.value, locale, gender),
    };
  };
}
