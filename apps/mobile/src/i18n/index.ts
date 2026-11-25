import { pick, type Gender, type Locale, type LocalizedText } from '@halal-meet/core';
import i18next from 'i18next';
import { useMemo } from 'react';
import { initReactI18next, useTranslation } from 'react-i18next';

import { useSession } from '../state/session';
import { resources } from './resources';
import { createT, createTs, type TFunction, type TParams, type TsFunction } from './translate';

export type { TFunction, TParams, TsFunction };

export const i18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  resources,
  lng: useSession.getState().locale ?? 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  returnNull: false,
  initAsync: false,
});

/** Non-hook translator (for toasts / imperative code). Uses the current session gender. */
export function tNow(key: string, params?: TParams): string {
  return createT(i18n, useSession.getState().gender)(key, params);
}

/** Gendered translator for components: picks `key_m` / `key_f` from the viewer's gender. */
export function useT(): TFunction {
  const { i18n: inst } = useTranslation();
  const gender = useSession((s) => s.gender);
  const lang = inst.language;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => createT(inst, gender), [inst, gender, lang]);
}

/** Translator for strings that describe another person (`key_he` / `key_she`). */
export function useTs(): TsFunction {
  const { i18n: inst } = useTranslation();
  const gender = useSession((s) => s.gender);
  const lang = inst.language;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => createTs(inst, gender), [inst, gender, lang]);
}

export function useLocale(): Locale {
  return useSession((s) => s.locale) ?? 'en';
}

export function useIsRTL(): boolean {
  return useLocale() === 'ar';
}

export function useViewerGender(): Gender {
  return useSession((s) => s.gender) ?? 'male';
}

/** Picks core LocalizedText (questions, options) for the current locale + viewer gender. */
export function usePick(): (text: LocalizedText) => string {
  const locale = useLocale();
  const gender = useViewerGender();
  return useMemo(() => (text: LocalizedText) => pick(text, locale, gender), [locale, gender]);
}
