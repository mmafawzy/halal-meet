import { Text as RNText, type TextProps as RNTextProps, type TextStyle } from 'react-native';

import { useLocale } from '../../i18n';
import { colors, variantStyle, type FontWeight, type TextVariant } from '../../theme';

export interface TextProps extends RNTextProps {
  variant?: TextVariant;
  color?: string;
  weight?: FontWeight;
  center?: boolean;
  /** Force a font locale (e.g. the Latin wordmark inside Arabic UI). */
  fontLocale?: 'en' | 'ar';
}

/**
 * App text: picks Inter / IBM Plex Sans Arabic by locale and bumps Arabic one size step.
 * Alignment is left to the platform's natural direction (no hard-coded left/right).
 */
export function Text({ variant = 'body', color = colors.text, weight, center, fontLocale, style, ...rest }: TextProps) {
  const locale = useLocale();
  const base: TextStyle = { ...variantStyle(variant, fontLocale ?? locale, weight), color };
  if (center) base.textAlign = 'center';
  return <RNText {...rest} style={[base, style]} />;
}
