import * as Haptics from 'expo-haptics';
import { ActivityIndicator, Platform, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { colors, palette, radii, spacing } from '../../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'gold' | 'danger' | 'dark';

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  size?: 'sm' | 'md' | 'lg';
  icon?: IconName;
  iconEnd?: IconName;
  /** Mirror the icons in RTL. */
  directionalIcon?: boolean;
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  haptic?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

const VARIANT: Record<ButtonVariant, { bg: string; fg: string; border?: string; pressed: string }> = {
  primary: { bg: colors.primary, fg: palette.white, pressed: '#286B57' },
  secondary: { bg: colors.primarySoft, fg: colors.primary, pressed: '#CFE5DB' },
  outline: { bg: 'transparent', fg: colors.text, border: colors.border, pressed: palette.sand100 },
  ghost: { bg: 'transparent', fg: colors.primary, pressed: palette.sand100 },
  gold: { bg: palette.gold500, fg: palette.navy900, pressed: '#B8913E' },
  danger: { bg: colors.dangerSoft, fg: colors.danger, pressed: '#EFCDD4' },
  dark: { bg: palette.navy900, fg: palette.ivory50, pressed: palette.navy700 },
};

const SIZE = {
  sm: { h: 36, px: spacing.md, text: 'small' as const, icon: 16 },
  md: { h: 48, px: spacing.lg, text: 'bodyStrong' as const, icon: 18 },
  lg: { h: 56, px: spacing.xl, text: 'subheading' as const, icon: 20 },
};

export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon,
  iconEnd,
  directionalIcon,
  loading,
  disabled,
  fullWidth,
  haptic,
  style,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const v = VARIANT[variant];
  const s = SIZE[size];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (haptic && Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        {
          height: s.h,
          paddingHorizontal: s.px,
          backgroundColor: pressed ? v.pressed : v.bg,
          borderColor: v.border ?? 'transparent',
          borderWidth: v.border ? 1 : 0,
          opacity: disabled ? 0.45 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.fg} />
      ) : (
        <View style={styles.row}>
          {icon ? <Icon name={icon} size={s.icon} color={v.fg} directional={directionalIcon} /> : null}
          <Text variant={s.text} color={v.fg} numberOfLines={1}>
            {label}
          </Text>
          {iconEnd ? <Icon name={iconEnd} size={s.icon} color={v.fg} directional={directionalIcon} /> : null}
        </View>
      )}
    </Pressable>
  );
}

/** Round icon-only button (header actions, close). */
export function IconButton({
  name,
  onPress,
  color = colors.text,
  bg = 'transparent',
  size = 40,
  directional,
  accessibilityLabel,
  style,
}: {
  name: IconName;
  onPress?: () => void;
  color?: string;
  bg?: string;
  size?: number;
  directional?: boolean;
  accessibilityLabel: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [
        { width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: pressed ? palette.sand200 : bg },
        style,
      ]}
    >
      <Icon name={name} size={Math.round(size * 0.52)} color={color} directional={directional} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
