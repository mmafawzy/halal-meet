import type { TextStyle } from 'react-native';

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold';
export type TextVariant = 'display' | 'title' | 'heading' | 'subheading' | 'body' | 'bodyStrong' | 'small' | 'caption' | 'overline';

const LATIN: Record<FontWeight, string> = {
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
};

const ARABIC: Record<FontWeight, string> = {
  regular: 'IBMPlexSansArabic_400Regular',
  medium: 'IBMPlexSansArabic_500Medium',
  semibold: 'IBMPlexSansArabic_600SemiBold',
  bold: 'IBMPlexSansArabic_700Bold',
};

export function fontFamily(locale: 'en' | 'ar', weight: FontWeight): string {
  return (locale === 'ar' ? ARABIC : LATIN)[weight];
}

interface VariantDef {
  size: number;
  lineHeight: number;
  weight: FontWeight;
  letterSpacing?: number;
  uppercase?: boolean;
}

export const VARIANTS: Record<TextVariant, VariantDef> = {
  display: { size: 30, lineHeight: 38, weight: 'bold', letterSpacing: -0.4 },
  title: { size: 24, lineHeight: 31, weight: 'bold', letterSpacing: -0.2 },
  heading: { size: 19, lineHeight: 26, weight: 'semibold' },
  subheading: { size: 16, lineHeight: 22, weight: 'semibold' },
  body: { size: 15, lineHeight: 22, weight: 'regular' },
  bodyStrong: { size: 15, lineHeight: 22, weight: 'semibold' },
  small: { size: 13, lineHeight: 18, weight: 'regular' },
  caption: { size: 12, lineHeight: 16, weight: 'medium' },
  overline: { size: 11, lineHeight: 14, weight: 'semibold', letterSpacing: 1.1, uppercase: true },
};

/** Arabic sizes are one step larger than Latin for legibility (spec 01 §0). */
export function variantStyle(variant: TextVariant, locale: 'en' | 'ar', weightOverride?: FontWeight): TextStyle {
  const v = VARIANTS[variant];
  const ar = locale === 'ar';
  return {
    fontFamily: fontFamily(locale, weightOverride ?? v.weight),
    fontSize: v.size + (ar ? 1 : 0),
    lineHeight: v.lineHeight + (ar ? 5 : 0),
    letterSpacing: ar ? 0 : v.letterSpacing,
    textTransform: v.uppercase && !ar ? 'uppercase' : undefined,
  };
}
