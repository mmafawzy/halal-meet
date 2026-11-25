import type { Locale } from '@halal-meet/core';

export interface CityDef {
  en: string;
  ar: string;
}

/** Suggested cities per country (stored canonically in English, displayed per locale). */
export const CITIES: Record<string, CityDef[]> = {
  EG: [
    { en: 'Cairo', ar: 'القاهرة' },
    { en: 'New Cairo', ar: 'القاهرة الجديدة' },
    { en: 'Alexandria', ar: 'الإسكندرية' },
    { en: 'Giza', ar: 'الجيزة' },
    { en: 'Mansoura', ar: 'المنصورة' },
  ],
  JO: [
    { en: 'Amman', ar: 'عمّان' },
    { en: 'Irbid', ar: 'إربد' },
    { en: 'Zarqa', ar: 'الزرقاء' },
  ],
  SA: [
    { en: 'Riyadh', ar: 'الرياض' },
    { en: 'Jeddah', ar: 'جدة' },
    { en: 'Dammam', ar: 'الدمام' },
    { en: 'Makkah', ar: 'مكة المكرمة' },
    { en: 'Madinah', ar: 'المدينة المنورة' },
  ],
  AE: [
    { en: 'Dubai', ar: 'دبي' },
    { en: 'Abu Dhabi', ar: 'أبوظبي' },
    { en: 'Sharjah', ar: 'الشارقة' },
  ],
  QA: [
    { en: 'Doha', ar: 'الدوحة' },
    { en: 'Al Wakrah', ar: 'الوكرة' },
  ],
  KW: [
    { en: 'Kuwait City', ar: 'مدينة الكويت' },
    { en: 'Hawalli', ar: 'حولي' },
  ],
  BH: [
    { en: 'Manama', ar: 'المنامة' },
    { en: 'Muharraq', ar: 'المحرق' },
  ],
  OM: [
    { en: 'Muscat', ar: 'مسقط' },
    { en: 'Salalah', ar: 'صلالة' },
  ],
  MA: [
    { en: 'Casablanca', ar: 'الدار البيضاء' },
    { en: 'Rabat', ar: 'الرباط' },
    { en: 'Marrakesh', ar: 'مراكش' },
    { en: 'Tangier', ar: 'طنجة' },
  ],
  DZ: [
    { en: 'Algiers', ar: 'الجزائر العاصمة' },
    { en: 'Oran', ar: 'وهران' },
    { en: 'Constantine', ar: 'قسنطينة' },
  ],
  TN: [
    { en: 'Tunis', ar: 'تونس العاصمة' },
    { en: 'Sfax', ar: 'صفاقس' },
    { en: 'Sousse', ar: 'سوسة' },
  ],
  GB: [
    { en: 'London', ar: 'لندن' },
    { en: 'Manchester', ar: 'مانشستر' },
    { en: 'Birmingham', ar: 'برمنغهام' },
    { en: 'Leicester', ar: 'ليستر' },
  ],
  IE: [
    { en: 'Dublin', ar: 'دبلن' },
    { en: 'Cork', ar: 'كورك' },
  ],
  DE: [
    { en: 'Berlin', ar: 'برلين' },
    { en: 'Hamburg', ar: 'هامبورغ' },
    { en: 'Munich', ar: 'ميونخ' },
    { en: 'Frankfurt', ar: 'فرانكفورت' },
  ],
  FR: [
    { en: 'Paris', ar: 'باريس' },
    { en: 'Lyon', ar: 'ليون' },
    { en: 'Marseille', ar: 'مرسيليا' },
  ],
  NL: [
    { en: 'Amsterdam', ar: 'أمستردام' },
    { en: 'Rotterdam', ar: 'روتردام' },
  ],
  BE: [
    { en: 'Brussels', ar: 'بروكسل' },
    { en: 'Antwerp', ar: 'أنتويرب' },
  ],
  US: [
    { en: 'New York', ar: 'نيويورك' },
    { en: 'Chicago', ar: 'شيكاغو' },
    { en: 'Houston', ar: 'هيوستن' },
    { en: 'Dearborn', ar: 'ديربورن' },
  ],
  CA: [
    { en: 'Toronto', ar: 'تورونتو' },
    { en: 'Montreal', ar: 'مونتريال' },
    { en: 'Mississauga', ar: 'ميسيساغا' },
  ],
};

/** Localised city label; unknown (free-typed) cities are shown as entered. */
export function cityLabel(country: string, city: string, locale: Locale): string {
  const def = CITIES[country]?.find((c) => c.en.toLowerCase() === city.toLowerCase() || c.ar === city);
  if (!def) return city;
  return locale === 'ar' ? def.ar : def.en;
}

/** Spoken languages offered in onboarding (ISO 639-1). */
export const LANGUAGES: Array<{ code: string; en: string; ar: string }> = [
  { code: 'ar', en: 'Arabic', ar: 'العربية' },
  { code: 'en', en: 'English', ar: 'الإنجليزية' },
  { code: 'fr', en: 'French', ar: 'الفرنسية' },
  { code: 'de', en: 'German', ar: 'الألمانية' },
  { code: 'nl', en: 'Dutch', ar: 'الهولندية' },
  { code: 'ur', en: 'Urdu', ar: 'الأردية' },
  { code: 'tr', en: 'Turkish', ar: 'التركية' },
  { code: 'so', en: 'Somali', ar: 'الصومالية' },
];

export function languageLabel(code: string, locale: Locale): string {
  const l = LANGUAGES.find((x) => x.code === code);
  return l ? l[locale] : code;
}
