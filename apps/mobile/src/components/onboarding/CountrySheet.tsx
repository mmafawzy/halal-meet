import { COUNTRIES } from '@halal-meet/core';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Sheet, Text, TextField } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

import { DIAL_CODES } from './draft';

/** Searchable country list in a bottom sheet (used for residence and for the phone dial code). */
export function CountrySheet({
  visible,
  onClose,
  value,
  onSelect,
  title,
  showDialCode = false,
}: {
  visible: boolean;
  onClose: () => void;
  value: string | null;
  onSelect: (code: string) => void;
  title: string;
  showDialCode?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const [query, setQuery] = useState('');

  const list = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^\+/, '');
    if (!q) return COUNTRIES;
    return COUNTRIES.filter(
      (c) =>
        c.name.en.toLowerCase().includes(q) ||
        c.name.ar.includes(q) ||
        c.code.toLowerCase() === q ||
        (showDialCode && DIAL_CODES[c.code]?.startsWith(q)),
    );
  }, [query, showDialCode]);

  return (
    <Sheet visible={visible} onClose={onClose} title={title}>
      <TextField
        value={query}
        onChangeText={setQuery}
        placeholder={t('onboarding.phone.search')}
        autoCorrect={false}
        accessibilityLabel={t('onboarding.phone.search')}
      />
      <View style={styles.list}>
        {list.length === 0 ? (
          <Text variant="small" color={colors.textMuted} center style={{ paddingVertical: spacing.xl }}>
            {t('onboarding.phone.noResults')}
          </Text>
        ) : (
          list.map((c, i) => {
            const selected = c.code === value;
            return (
              <Pressable
                key={c.code}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => {
                  onSelect(c.code);
                  setQuery('');
                  onClose();
                }}
                style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { backgroundColor: palette.sand100 }]}
              >
                <Text style={{ fontSize: 22, lineHeight: 28 }}>{c.flag}</Text>
                <Text variant="body" weight={selected ? 'semibold' : 'regular'} style={{ flex: 1 }}>
                  {c.name[locale]}
                </Text>
                {showDialCode ? (
                  <Text variant="small" color={colors.textMuted} fontLocale="en" style={{ writingDirection: 'ltr' }}>
                    +{DIAL_CODES[c.code]}
                  </Text>
                ) : null}
                {selected ? <Icon name="checkmark-circle" size={20} color={colors.primary} /> : null}
              </Pressable>
            );
          })
        )}
      </View>
    </Sheet>
  );
}

/** Square checkbox row with a label and optional explanation. */
export function CheckRow({
  checked,
  onChange,
  label,
  description,
  testID,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description?: string;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={() => onChange(!checked)}
      style={styles.check}
    >
      <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Icon name="checkmark" size={14} color={palette.white} /> : null}</View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium">
          {label}
        </Text>
        {description ? (
          <Text variant="caption" color={colors.textMuted}>
            {description}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  list: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  check: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingVertical: spacing.sm },
  box: {
    width: 22,
    height: 22,
    marginTop: 1,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: palette.navy300,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgElevated,
  },
  boxOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
