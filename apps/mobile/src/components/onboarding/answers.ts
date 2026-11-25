/**
 * Answer helpers for the religion / starter questions / dealbreakers onboarding steps:
 * which questions each step shows, how an answer is summarised, saving draft answers to
 * PUT /me/answers and the live "people who match your must-haves" counter.
 */
import { QUESTIONS, QUESTIONS_BY_KEY, STARTER_QUESTION_KEYS, type Answer, type Gender, type LocalizedText } from '@halal-meet/core';
import { useQuery } from '@tanstack/react-query';
import { useCallback } from 'react';

import { api } from '@/api';
import { useSaveAnswers } from '@/api/hooks';
import { isAnswerComplete } from '@/components/questions/QuestionEditor';
import { tNow } from '@/i18n';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';

/** Religious practice + partner religious preferences (spec 01 §11–12). */
export const RELIGION_KEYS: string[] = QUESTIONS.filter((q) => q.dimension === 'religion').map((q) => q.key);

/** Extra questions that round the starter set up to 10 across Family / Marriage / Children (spec 01 §16). */
const STARTER_FILL = ['parents_involvement', 'household_roles', 'children_when', 'finances'];

/** The starter marriage questions: core `starter` questions outside religion (asked on the previous step), up to 10. */
export const STARTER_KEYS: string[] = (() => {
  const keys = STARTER_QUESTION_KEYS.filter((k) => !RELIGION_KEYS.includes(k));
  for (const k of STARTER_FILL) {
    if (keys.length >= 10) break;
    if (QUESTIONS_BY_KEY[k] && !keys.includes(k)) keys.push(k);
  }
  return keys;
})();

/**
 * A dealbreaker only filters when it lists accepted values (core `passesDealbreakers`). If the user
 * marked something a dealbreaker without saying what they accept, treat it as "same as me".
 */
export function normalizeAnswer(a: Answer): Answer {
  if (a.importance !== 'dealbreaker' || (a.accept && a.accept.length > 0) || a.self === null) return a;
  const self = Array.isArray(a.self) ? a.self : [a.self];
  return self.length ? { ...a, accept: self } : a;
}

export function optionLabels(questionKey: string, values: string[], p: (t: LocalizedText) => string): string[] {
  const q = QUESTIONS_BY_KEY[questionKey];
  if (!q) return values;
  return values.map((v) => {
    const o = q.options.find((x) => x.value === v);
    return o ? p(o.label) : v;
  });
}

export function joinList(items: string[], locale: string): string {
  return items.join(locale === 'ar' ? '، ' : ', ');
}

export function selfValues(a: Answer): string[] {
  if (a.self === null) return [];
  return Array.isArray(a.self) ? a.self : [a.self];
}

/** True when a dealbreaker means "same as my own answer" (accept is exactly my own answer). */
export function isSameAsSelf(a: Answer): boolean {
  const self = selfValues(a);
  return !!a.accept && self.length > 0 && a.accept.length === self.length && a.accept.every((v) => self.includes(v));
}

/**
 * Saves the complete draft answers for `keys` (all keys when omitted) to PUT /me/answers.
 * Shows the shared error toast and resolves false on failure.
 */
export function useSaveDraftAnswers() {
  const mutation = useSaveAnswers();
  const { mutateAsync } = mutation;

  const saveDraftAnswers = useCallback(
    async (keys?: string[]): Promise<boolean> => {
      const s = useSession.getState();
      const gender: Gender = s.draft.gender ?? s.gender ?? 'male';
      const list = Object.values(s.draft.answers)
        .filter((a) => (!keys || keys.includes(a.questionKey)) && isAnswerComplete(a, gender))
        .map(normalizeAnswer);
      if (list.length === 0) return true;
      try {
        await mutateAsync(list);
        return true;
      } catch {
        useUi.getState().showToast({ message: tNow('common.states.error'), tone: 'danger' });
        return false;
      }
    },
    [mutateAsync],
  );

  return { saveDraftAnswers, saving: mutation.isPending };
}

/** Below this many eligible people the dealbreakers step suggests relaxing one or two. */
export const LOW_ELIGIBLE = 10;
const MAX_PAGES = 40;

/**
 * Counts the people who pass the user's hard filters by paging the feed (every profile in it already
 * passed eligibility in both directions). The contract has no count route yet.
 * TODO: switch to a dedicated count endpoint once the API has one (spec 01 §15).
 */
export function useEligibleCount(signature: string, enabled: boolean) {
  return useQuery({
    queryKey: ['onboarding', 'eligibleCount', signature],
    enabled,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      let cursor: string | null = null;
      let count = 0;
      for (let i = 0; i < MAX_PAGES; i++) {
        const page = await api.feed(cursor);
        count += page.items.filter((it) => it.type === 'profile').length;
        if (page.endOfPool || !page.nextCursor) break;
        cursor = page.nextCursor;
      }
      return count;
    },
  });
}
