import type { ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useIsRTL, useT } from '../../i18n';
import { colors, palette, radii, spacing } from '../../theme';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Star } from './StarPattern';
import { Text } from './Text';

/** Latin "HALAL MEET" wordmark (used in both languages — never transliterated). */
export function Wordmark({ size = 22, color = colors.text, accent = palette.gold500 }: { size?: number; color?: string; accent?: string }) {
  const rtl = useIsRTL();
  // The wordmark always reads left-to-right, so the row is reversed in RTL to keep HALAL ✦ MEET in order.
  return (
    <View
      style={[styles.wordmark, rtl ? { flexDirection: 'row-reverse' } : null]}
      accessibilityRole="header"
      accessibilityLabel="Halal Meet"
    >
      <Text fontLocale="en" weight="bold" color={color} style={{ fontSize: size, lineHeight: size * 1.25, letterSpacing: size * 0.16 }}>
        HALAL
      </Text>
      <Star size={size * 0.62} color={accent} />
      <Text fontLocale="en" weight="bold" color={color} style={{ fontSize: size, lineHeight: size * 1.25, letterSpacing: size * 0.16 }}>
        MEET
      </Text>
    </View>
  );
}

export function ProgressBar({ value, color = colors.primary, style }: { value: number; color?: string; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.track, style]}>
      <View style={[styles.fill, { width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, backgroundColor: color }]} />
    </View>
  );
}

export function SectionTitle({ title, action, style }: { title: string; action?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.section, style]}>
      <Text variant="overline" color={colors.textMuted} style={{ flex: 1 }}>
        {title}
      </Text>
      {action}
    </View>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

export function LoadingState({ label }: { label?: string }) {
  const t = useT();
  return (
    <View style={styles.state}>
      <ActivityIndicator color={colors.primary} />
      <Text variant="small" color={colors.textMuted}>
        {label ?? t('common.states.loading')}
      </Text>
    </View>
  );
}

export function ErrorState({ onRetry, message }: { onRetry?: () => void; message?: string }) {
  const t = useT();
  return (
    <View style={styles.state}>
      <Icon name="cloud-offline-outline" size={32} color={colors.textSubtle} />
      <Text variant="bodyStrong" center>
        {message ?? t('common.states.error')}
      </Text>
      <Text variant="small" color={colors.textMuted} center>
        {t('common.states.errorBody')}
      </Text>
      {onRetry ? <Button label={t('common.actions.retry')} variant="outline" size="sm" onPress={onRetry} /> : null}
    </View>
  );
}

export function EmptyState({
  icon = 'leaf-outline',
  title,
  body,
  action,
}: {
  icon?: IconName;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.state}>
      <View style={styles.emptyIcon}>
        <Icon name={icon} size={28} color={colors.primary} />
      </View>
      <Text variant="heading" center>
        {title}
      </Text>
      {body ? (
        <Text variant="body" color={colors.textMuted} center style={{ maxWidth: 320 }}>
          {body}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

/** Small "Preview" ribbon for features stored locally (backend not ready yet). */
export function PreviewBadge({ label }: { label?: string }) {
  const t = useT();
  return (
    <View style={styles.preview}>
      <Icon name="flask-outline" size={12} color="#8A6A22" />
      <Text variant="caption" color="#8A6A22">
        {label ?? t('common.preview')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wordmark: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  track: { height: 6, borderRadius: 3, backgroundColor: palette.sand200, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  section: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  state: { alignItems: 'center', justifyContent: 'center', gap: spacing.md, paddingVertical: spacing.huge, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  preview: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.premiumSoft,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
});
