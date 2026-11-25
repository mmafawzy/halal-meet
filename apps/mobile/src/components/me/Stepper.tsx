import { StyleSheet, View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

/** − value + control for small integer ranges (age bounds). Numbers stay Western digits. */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  testID,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  testID?: string;
}) {
  const t = useT();
  return (
    <View style={styles.box} testID={testID}>
      <Text variant="caption" color={colors.textMuted}>
        {label}
      </Text>
      <View style={styles.row}>
        <IconButton
          name="remove"
          size={36}
          bg={value <= min ? palette.sand100 : colors.primaryTint}
          color={value <= min ? colors.textSubtle : colors.primary}
          accessibilityLabel={t('me.prefs.decrease', { label })}
          onPress={() => value > min && onChange(value - 1)}
        />
        <Text variant="heading" fontLocale="en" style={styles.value} accessibilityLabel={`${label} ${value}`}>
          {value}
        </Text>
        <IconButton
          name="add"
          size={36}
          bg={value >= max ? palette.sand100 : colors.primaryTint}
          color={value >= max ? colors.textSubtle : colors.primary}
          accessibilityLabel={t('me.prefs.increase', { label })}
          onPress={() => value < max && onChange(value + 1)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flex: 1,
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  value: { minWidth: 36, textAlign: 'center' },
});
