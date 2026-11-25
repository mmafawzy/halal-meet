import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';

import { useIsRTL, useLocale } from '../../i18n';
import { colors, fontFamily, palette, radii, spacing } from '../../theme';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

export function Field({ label, hint, error, children, style }: { label?: string; hint?: string; error?: string | null; children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ gap: spacing.xs + 2 }, style]}>
      {label ? (
        <Text variant="small" weight="semibold" color={colors.textMuted}>
          {label}
        </Text>
      ) : null}
      {children}
      {error ? (
        <Text variant="caption" color={colors.danger}>
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" color={colors.textSubtle}>
          {hint}
        </Text>
      ) : null}
    </View>
  );
}

export function TextField({ style, multiline, ...props }: TextInputProps) {
  const locale = useLocale();
  const rtl = useIsRTL();
  return (
    <TextInput
      placeholderTextColor={colors.textSubtle}
      multiline={multiline}
      {...props}
      style={[
        styles.input,
        multiline && styles.multiline,
        {
          fontFamily: fontFamily(locale, 'regular'),
          fontSize: locale === 'ar' ? 16 : 15,
          textAlign: rtl ? 'right' : 'left',
          writingDirection: rtl ? 'rtl' : 'ltr',
        },
        style,
      ]}
    />
  );
}

/** Two-to-four option segmented control. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: Array<{ value: T; label: string; badge?: string }>;
  value: T;
  onChange: (v: T) => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[styles.segmented, style]} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.value)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text variant="small" weight={active ? 'semibold' : 'medium'} color={active ? colors.text : colors.textMuted} numberOfLines={1}>
              {o.label}
            </Text>
            {o.badge ? (
              <View style={styles.segBadge}>
                <Text variant="caption" color={palette.white} fontLocale="en" style={{ fontSize: 10, lineHeight: 13 }}>
                  {o.badge}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

/** Settings-style row with an icon, label, optional value and a (mirrored) chevron. */
export function ListRow({
  icon,
  label,
  value,
  onPress,
  danger,
  right,
  description,
  iconColor,
}: {
  icon?: IconName;
  label: string;
  value?: string;
  description?: string;
  onPress?: () => void;
  danger?: boolean;
  right?: ReactNode;
  iconColor?: string;
}) {
  const color = danger ? colors.danger : colors.text;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sand100 }]}
    >
      {icon ? (
        <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}>
          <Icon name={icon} size={18} color={danger ? colors.danger : (iconColor ?? colors.primary)} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium" color={color}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.textMuted}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="small" color={colors.textMuted} numberOfLines={1} style={{ maxWidth: '45%' }}>
          {value}
        </Text>
      ) : null}
      {right ?? (onPress ? <Icon name="chevron-forward" size={18} color={colors.textSubtle} directional /> : null)}
    </Pressable>
  );
}

export function ToggleRow({
  label,
  description,
  value,
  onChange,
  disabled,
  icon,
  locked,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  icon?: IconName;
  locked?: boolean;
}) {
  return (
    <View style={styles.row}>
      {icon ? (
        <View style={styles.rowIcon}>
          <Icon name={icon} size={18} color={colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium" color={disabled ? colors.textSubtle : colors.text}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.textMuted}>
            {description}
          </Text>
        ) : null}
      </View>
      {locked ? <Icon name="lock-closed" size={16} color={colors.premium} /> : null}
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.primary, false: palette.sand300 }}
        thumbColor={palette.white}
        accessibilityLabel={label}
      />
    </View>
  );
}

/** Group container for rows (rounded white card with hairline separators). */
export function RowGroup({ children, title, style }: { children: ReactNode; title?: string; style?: StyleProp<ViewStyle> }) {
  const items = (Array.isArray(children) ? children : [children]).flat().filter(Boolean);
  return (
    <View style={[{ gap: spacing.sm }, style]}>
      {title ? (
        <Text variant="overline" color={colors.textMuted} style={{ paddingHorizontal: spacing.xs }}>
          {title}
        </Text>
      ) : null}
      <View style={styles.group}>
        {items.map((child, i) => (
          <View key={i} style={i > 0 ? styles.separator : null}>
            {child}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Big selectable card (intention, Halal Mode, purpose pickers). */
export function OptionCard({
  title,
  description,
  selected,
  onPress,
  icon,
  badge,
  multi,
}: {
  title: string;
  description?: string;
  selected: boolean;
  onPress: () => void;
  icon?: IconName;
  badge?: string;
  multi?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole={multi ? 'checkbox' : 'radio'}
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && !selected && { backgroundColor: palette.sand100 },
      ]}
    >
      {icon ? (
        <View style={[styles.optionIcon, selected && { backgroundColor: colors.primary }]}>
          <Icon name={icon} size={20} color={selected ? palette.white : colors.primary} />
        </View>
      ) : null}
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
          <Text variant="bodyStrong">{title}</Text>
          {badge ? (
            <View style={styles.optionBadge}>
              <Text variant="caption" color="#8A6A22">
                {badge}
              </Text>
            </View>
          ) : null}
        </View>
        {description ? (
          <Text variant="small" color={colors.textMuted}>
            {description}
          </Text>
        ) : null}
      </View>
      <View style={[multi ? styles.check : styles.radio, selected && styles.radioOn]}>
        {selected ? <Icon name="checkmark" size={14} color={palette.white} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  input: {
    minHeight: 50,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.text,
  },
  multiline: { minHeight: 110, textAlignVertical: 'top' },
  segmented: { flexDirection: 'row', backgroundColor: palette.sand200, borderRadius: radii.pill, padding: 4, gap: 4 },
  segment: { flex: 1, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', paddingVertical: 9, borderRadius: radii.pill },
  segmentActive: { backgroundColor: colors.bgElevated, shadowColor: palette.navy900, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  segBadge: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2, minHeight: 56 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  group: { backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  separator: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  optionIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  optionBadge: { backgroundColor: colors.premiumSoft, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 1 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center' },
  check: { width: 22, height: 22, borderRadius: 6, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
