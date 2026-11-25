import i18next from 'i18next';
import { describe, expect, it } from 'vitest';

import { createT, createTs, genderSuffix, resolveGenderedKey } from './translate';

function makeI18n(lng: 'en' | 'ar') {
  const inst = i18next.createInstance();
  void inst.init({
    lng,
    fallbackLng: 'en',
    initAsync: false,
    interpolation: { escapeValue: false },
    resources: {
      en: {
        translation: {
          greet: 'Welcome, {{name}}',
          ready: 'Are you ready?',
          neutral: 'Discover',
          lives: 'Lives in {{city}}',
        },
      },
      ar: {
        translation: {
          greet_m: 'أهلًا بك يا {{name}}',
          greet_f: 'أهلًا بكِ يا {{name}}',
          ready_m: 'هل أنت مستعد؟',
          ready_f: 'هل أنتِ مستعدة؟',
          neutral: 'اكتشف',
          lives: 'يقيم في {{city}}',
          lives_she: 'تقيم في {{city}}',
        },
      },
    },
  });
  return inst;
}

describe('gendered t() helper', () => {
  it('picks the feminine Arabic variant for a female viewer', () => {
    const t = createT(makeI18n('ar'), 'female');
    expect(t('ready')).toBe('هل أنتِ مستعدة؟');
    expect(t('greet', { name: 'سارة' })).toBe('أهلًا بكِ يا سارة');
  });

  it('picks the masculine Arabic variant for a male viewer', () => {
    const t = createT(makeI18n('ar'), 'male');
    expect(t('ready')).toBe('هل أنت مستعد؟');
  });

  it('falls back to masculine before the gender is known', () => {
    const t = createT(makeI18n('ar'), null);
    expect(t('ready')).toBe('هل أنت مستعد؟');
    expect(genderSuffix(undefined)).toBe('m');
  });

  it('uses the neutral key when no gendered variant exists', () => {
    const t = createT(makeI18n('ar'), 'female');
    expect(t('neutral')).toBe('اكتشف');
  });

  it('is a no-op for English (no gendered keys)', () => {
    const t = createT(makeI18n('en'), 'female');
    expect(t('ready')).toBe('Are you ready?');
    expect(t('greet', { name: 'Sara' })).toBe('Welcome, Sara');
  });

  it('resolves keys via the exists() callback', () => {
    const exists = (k: string) => k === 'a.b_f';
    expect(resolveGenderedKey('a.b', 'female', exists)).toBe('a.b_f');
    expect(resolveGenderedKey('a.b', 'male', exists)).toBe('a.b');
  });

  it('subject-gendered strings use _she / _he', () => {
    const ts = createTs(makeI18n('ar'), 'male');
    expect(ts('lives', 'female', { city: 'دبي' })).toBe('تقيم في دبي');
    expect(ts('lives', 'male', { city: 'دبي' })).toBe('يقيم في دبي');
  });
});
