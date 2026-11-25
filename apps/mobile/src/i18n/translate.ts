/**
 * Gendered translation helper (pure; no React / RN imports so it is unit-testable).
 *
 * Arabic copy is addressed to the *viewer*, so many Arabic strings exist as `key_m` / `key_f`.
 * `createT` looks for `${key}_m|_f` first (based on the signed-in user's gender) and falls back to
 * the neutral `key`. Before the gender is known we use the masculine form (spec: generic address).
 */
import type { i18n as I18n, TOptions } from 'i18next';

export type ViewerGender = 'male' | 'female' | null | undefined;
export type TParams = TOptions & Record<string, unknown>;
export type TFunction = (key: string, params?: TParams) => string;

export function genderSuffix(gender: ViewerGender): 'm' | 'f' {
  return gender === 'female' ? 'f' : 'm';
}

/** Returns the most specific key that exists: `key_f` / `key_m`, else `key`. */
export function resolveGenderedKey(key: string, gender: ViewerGender, exists: (k: string) => boolean): string {
  const gendered = `${key}_${genderSuffix(gender)}`;
  return exists(gendered) ? gendered : key;
}

export function createT(i18n: I18n, gender: ViewerGender): TFunction {
  return (key, params) => {
    const resolved = resolveGenderedKey(key, gender, (k) => i18n.exists(k, params));
    const out = i18n.t(resolved, params as TOptions);
    return typeof out === 'string' ? out : String(out);
  };
}

/**
 * Subject-gendered lookup: strings that describe *another* person (e.g. «يقيم» / «تقيم») use
 * `key_he` / `key_she`, falling back to the viewer-gendered resolution of `key`.
 */
export function createTs(i18n: I18n, viewer: ViewerGender) {
  const t = createT(i18n, viewer);
  return (key: string, subject: ViewerGender, params?: TParams): string => {
    const subjectKey = `${key}_${subject === 'female' ? 'she' : 'he'}`;
    if (i18n.exists(subjectKey, params)) {
      const out = i18n.t(subjectKey, params as TOptions);
      return typeof out === 'string' ? out : String(out);
    }
    return t(key, params);
  };
}
export type TsFunction = ReturnType<typeof createTs>;
