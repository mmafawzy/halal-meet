/**
 * Builds i18next resources from the per-feature string modules in ./strings.
 * Each module exports `en`, `ar` (same shape) and optionally `arGendered` (extra `_m`/`_f`/`_he`/`_she` keys).
 */
import * as chat from './strings/chat';
import * as common from './strings/common';
import * as discover from './strings/discover';
import * as family from './strings/family';
import * as matches from './strings/matches';
import * as me from './strings/me';
import * as onboarding from './strings/onboarding';
import * as passport from './strings/passport';
import * as paywall from './strings/paywall';
import * as profile from './strings/profile';

type Dict = { [k: string]: string | Dict };

interface StringModule {
  en: Dict;
  ar: Dict;
  arGendered?: Dict;
}

export function deepMerge(a: Dict, b: Dict): Dict {
  const out: Dict = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = typeof v === 'object' && typeof cur === 'object' ? deepMerge(cur, v) : v;
  }
  return out;
}

const MODULES: Record<string, StringModule> = {
  common: common as unknown as StringModule,
  onboarding: onboarding as unknown as StringModule,
  discover: discover as unknown as StringModule,
  profile: profile as unknown as StringModule,
  matches: matches as unknown as StringModule,
  chat: chat as unknown as StringModule,
  family: family as unknown as StringModule,
  me: me as unknown as StringModule,
  passport: passport as unknown as StringModule,
  paywall: paywall as unknown as StringModule,
};

function build(lang: 'en' | 'ar'): Dict {
  const out: Dict = {};
  for (const [ns, mod] of Object.entries(MODULES)) {
    out[ns] = lang === 'en' ? mod.en : deepMerge(mod.ar, mod.arGendered ?? {});
  }
  return out;
}

export const resources = {
  en: { translation: build('en') },
  ar: { translation: build('ar') },
};
