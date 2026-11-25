export type RegionId =
  | 'egypt_levant'
  | 'gcc'
  | 'maghreb'
  | 'uk_ireland'
  | 'western_europe'
  | 'north_america'
  | 'rest_of_world';

/** Growing = below density threshold, free users see their whole region. Open = country-level default. */
export type CountryStatus = 'growing' | 'open';

export interface CountryInfo {
  code: string; // ISO-3166 alpha-2
  flag: string;
  name: { en: string; ar: string };
  region: RegionId;
  currency: string;
}

export const REGIONS: Record<RegionId, { en: string; ar: string }> = {
  egypt_levant: { en: 'Egypt & Levant', ar: 'مصر والشام' },
  gcc: { en: 'Gulf (GCC)', ar: 'الخليج' },
  maghreb: { en: 'Maghreb', ar: 'المغرب العربي' },
  uk_ireland: { en: 'UK & Ireland', ar: 'المملكة المتحدة وأيرلندا' },
  western_europe: { en: 'Western Europe', ar: 'أوروبا الغربية' },
  north_america: { en: 'North America', ar: 'أمريكا الشمالية' },
  rest_of_world: { en: 'Worldwide', ar: 'حول العالم' },
};

export const COUNTRIES: CountryInfo[] = [
  { code: 'EG', flag: '🇪🇬', name: { en: 'Egypt', ar: 'مصر' }, region: 'egypt_levant', currency: 'EGP' },
  { code: 'JO', flag: '🇯🇴', name: { en: 'Jordan', ar: 'الأردن' }, region: 'egypt_levant', currency: 'JOD' },
  { code: 'SA', flag: '🇸🇦', name: { en: 'Saudi Arabia', ar: 'السعودية' }, region: 'gcc', currency: 'SAR' },
  { code: 'AE', flag: '🇦🇪', name: { en: 'UAE', ar: 'الإمارات' }, region: 'gcc', currency: 'AED' },
  { code: 'QA', flag: '🇶🇦', name: { en: 'Qatar', ar: 'قطر' }, region: 'gcc', currency: 'QAR' },
  { code: 'KW', flag: '🇰🇼', name: { en: 'Kuwait', ar: 'الكويت' }, region: 'gcc', currency: 'KWD' },
  { code: 'BH', flag: '🇧🇭', name: { en: 'Bahrain', ar: 'البحرين' }, region: 'gcc', currency: 'BHD' },
  { code: 'OM', flag: '🇴🇲', name: { en: 'Oman', ar: 'عُمان' }, region: 'gcc', currency: 'OMR' },
  { code: 'MA', flag: '🇲🇦', name: { en: 'Morocco', ar: 'المغرب' }, region: 'maghreb', currency: 'MAD' },
  { code: 'DZ', flag: '🇩🇿', name: { en: 'Algeria', ar: 'الجزائر' }, region: 'maghreb', currency: 'DZD' },
  { code: 'TN', flag: '🇹🇳', name: { en: 'Tunisia', ar: 'تونس' }, region: 'maghreb', currency: 'TND' },
  { code: 'GB', flag: '🇬🇧', name: { en: 'United Kingdom', ar: 'المملكة المتحدة' }, region: 'uk_ireland', currency: 'GBP' },
  { code: 'IE', flag: '🇮🇪', name: { en: 'Ireland', ar: 'أيرلندا' }, region: 'uk_ireland', currency: 'EUR' },
  { code: 'DE', flag: '🇩🇪', name: { en: 'Germany', ar: 'ألمانيا' }, region: 'western_europe', currency: 'EUR' },
  { code: 'FR', flag: '🇫🇷', name: { en: 'France', ar: 'فرنسا' }, region: 'western_europe', currency: 'EUR' },
  { code: 'NL', flag: '🇳🇱', name: { en: 'Netherlands', ar: 'هولندا' }, region: 'western_europe', currency: 'EUR' },
  { code: 'BE', flag: '🇧🇪', name: { en: 'Belgium', ar: 'بلجيكا' }, region: 'western_europe', currency: 'EUR' },
  { code: 'US', flag: '🇺🇸', name: { en: 'United States', ar: 'الولايات المتحدة' }, region: 'north_america', currency: 'USD' },
  { code: 'CA', flag: '🇨🇦', name: { en: 'Canada', ar: 'كندا' }, region: 'north_america', currency: 'CAD' },
];

export const COUNTRIES_BY_CODE: Record<string, CountryInfo> = Object.fromEntries(
  COUNTRIES.map((c) => [c.code, c]),
);

export function regionOf(country: string): RegionId {
  return COUNTRIES_BY_CODE[country]?.region ?? 'rest_of_world';
}

/** Density threshold for a country to flip from Growing to Open (see spec 06 §1). */
export const OPEN_THRESHOLD = {
  verifiedProfiles: 2000,
  /** Maximum share of the majority gender among active verified profiles. */
  maxGenderShare: 0.6,
};

export function computeCountryStatus(verifiedProfiles: number, maleShare: number): CountryStatus {
  const majority = Math.max(maleShare, 1 - maleShare);
  return verifiedProfiles >= OPEN_THRESHOLD.verifiedProfiles && majority <= OPEN_THRESHOLD.maxGenderShare
    ? 'open'
    : 'growing';
}
