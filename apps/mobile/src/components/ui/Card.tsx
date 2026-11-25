import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, radii, shadow, spacing } from '../../theme';

export function Card({
  children,
  style,
  onPress,
  padded = true,
  tone = 'default',
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  padded?: boolean;
  tone?: 'default' | 'muted' | 'premium' | 'primary' | 'discuss' | 'danger' | 'dark';
  accessibilityLabel?: string;
}) {
  const toneStyle = TONES[tone];
  const content = [styles.card, padded && styles.padded, toneStyle, style];
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        onPress={onPress}
        style={({ pressed }) => [...content, pressed && { opacity: 0.92 }]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={content}>{children}</View>;
}

const TONES: Record<string, ViewStyle> = {
  default: { backgroundColor: colors.card, borderColor: colors.borderSoft },
  muted: { backgroundColor: colors.bgMuted, borderColor: colors.borderSoft, shadowOpacity: 0, elevation: 0 },
  premium: { backgroundColor: colors.premiumSoft, borderColor: '#E9D6A6' },
  primary: { backgroundColor: colors.primaryTint, borderColor: colors.primarySoft },
  discuss: { backgroundColor: colors.discussSoft, borderColor: '#F2D3A6' },
  danger: { backgroundColor: colors.dangerSoft, borderColor: '#EBC3CC' },
  dark: { backgroundColor: colors.navy, borderColor: colors.navy },
};

const styles = StyleSheet.create({
  card: { borderRadius: radii.xl, borderWidth: 1, ...shadow.soft, overflow: 'hidden' },
  padded: { padding: spacing.lg },
});
