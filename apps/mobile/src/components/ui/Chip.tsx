import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, palette, radii, spacing } from '../../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  tone?: 'primary' | 'gold' | 'danger' | 'amber' | 'neutral';
  size?: 'sm' | 'md';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const TONE = {
  primary: { bg: colors.primary, soft: colors.primaryTint, fg: colors.primary },
  gold: { bg: palette.gold500, soft: colors.premiumSoft, fg: '#8A6A22' },
  danger: { bg: colors.danger, soft: colors.dangerSoft, fg: colors.danger },
  amber: { bg: colors.discuss, soft: colors.discussSoft, fg: '#9A5E12' },
  neutral: { bg: palette.navy900, soft: palette.sand100, fg: palette.navy700 },
};

/** Selectable pill. Unselected chips are outlined; selected chips are filled in the tone colour. */
export function Chip({ label, selected, onPress, icon, tone = 'primary', size = 'md', disabled, style }: ChipProps) {
  const t = TONE[tone];
  const fg = selected ? palette.white : colors.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityState={{ selected: !!selected, disabled: !!disabled }}
      disabled={disabled || !onPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        size === 'sm' ? styles.sm : styles.md,
        {
          backgroundColor: selected ? t.bg : pressed ? palette.sand100 : colors.bgElevated,
          borderColor: selected ? t.bg : colors.border,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {icon ? <Icon name={icon} size={size === 'sm' ? 13 : 15} color={fg} /> : null}
      <Text variant={size === 'sm' ? 'caption' : 'small'} weight="medium" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Static, non-interactive label pill. */
export function Tag({
  label,
  icon,
  tone = 'neutral',
  style,
}: {
  label: string;
  icon?: IconName;
  tone?: keyof typeof TONE;
  style?: StyleProp<ViewStyle>;
}) {
  const t = TONE[tone];
  return (
    <View style={[styles.tag, { backgroundColor: t.soft }, style]}>
      {icon ? <Icon name={icon} size={12} color={t.fg} /> : null}
      <Text variant="caption" color={t.fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, borderRadius: radii.pill, borderWidth: 1 },
  sm: { paddingHorizontal: spacing.sm + 2, height: 30 },
  md: { paddingHorizontal: spacing.md + 2, height: 38 },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.pill,
    alignSelf: 'flex-start',
  },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
