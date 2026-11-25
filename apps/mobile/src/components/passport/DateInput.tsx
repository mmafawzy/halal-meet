import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Field, TextField } from '@/components/ui';
import { useT } from '@/i18n';
import { directionProps } from '@/lib/direction';
import { spacing } from '@/theme';

function split(iso: string): [string, string, string] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? [m[3]!, m[2]!, m[1]!] : ['', '', ''];
}

function join(day: string, month: string, year: string): string {
  if (!day || !month || year.length !== 4) return '';
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

/**
 * Day / month / year entry for Travel-mode dates. Like the onboarding birth-date field, the parts keep
 * their own state, numerals stay Western and the row stays left-to-right in Arabic so a date is never
 * reordered by the text direction. The parent receives `YYYY-MM-DD`, or '' while incomplete.
 */
export function DateInput({
  label,
  value,
  onChange,
  error,
  hint,
  testID,
}: {
  label: string;
  value: string;
  onChange: (iso: string) => void;
  error?: string | null;
  hint?: string;
  testID?: string;
}) {
  const t = useT();
  const [parts, setParts] = useState<[string, string, string]>(() => split(value));

  useEffect(() => {
    if (value && value !== join(parts[0], parts[1], parts[2])) setParts(split(value));
    if (!value && parts.every((p) => p.length > 0) && join(parts[0], parts[1], parts[2]) !== '') setParts(['', '', '']);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const set = (i: 0 | 1 | 2, raw: string) => {
    const next: [string, string, string] = [...parts];
    next[i] = raw.replace(/\D/g, '');
    setParts(next);
    onChange(join(next[0], next[1], next[2]));
  };

  return (
    <Field label={label} error={error ?? null} hint={hint}>
      <View {...LTR} style={[styles.row, LTR.style]}>
        <TextField
          value={parts[0]}
          onChangeText={(v) => set(0, v)}
          placeholder={t('passport.activate.dates.day')}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={`${label} ${t('passport.activate.dates.day')}`}
          style={styles.short}
          testID={testID ? `${testID}-day` : undefined}
        />
        <TextField
          value={parts[1]}
          onChangeText={(v) => set(1, v)}
          placeholder={t('passport.activate.dates.month')}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={`${label} ${t('passport.activate.dates.month')}`}
          style={styles.short}
          testID={testID ? `${testID}-month` : undefined}
        />
        <TextField
          value={parts[2]}
          onChangeText={(v) => set(2, v)}
          placeholder={t('passport.activate.dates.year')}
          keyboardType="number-pad"
          maxLength={4}
          accessibilityLabel={`${label} ${t('passport.activate.dates.year')}`}
          style={styles.long}
          testID={testID ? `${testID}-year` : undefined}
        />
      </View>
    </Field>
  );
}

/** Day / month / year stays in this order in Arabic too. */
const LTR = directionProps('ltr');

const styles = StyleSheet.create({
  // Always LTR so DD / MM / YYYY keep their order in Arabic.
  row: { flexDirection: 'row', gap: spacing.sm },
  short: { flex: 1, textAlign: 'center', writingDirection: 'ltr' },
  long: { flex: 1.6, textAlign: 'center', writingDirection: 'ltr' },
});
