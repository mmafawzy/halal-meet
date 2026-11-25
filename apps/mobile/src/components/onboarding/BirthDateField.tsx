import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Field, Text, TextField } from '@/components/ui';
import { useT } from '@/i18n';
import { ageFromBirthDate } from '@/lib/format';
import { colors, radii, spacing } from '@/theme';

import { isValidBirthDate } from './draft';

function split(birthDate: string): [string, string, string] {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate);
  return m ? [m[3]!, m[2]!, m[1]!] : ['', '', ''];
}

function join(day: string, month: string, year: string): string {
  return day.length === 2 && month.length === 2 && year.length === 4 ? `${year}-${month}-${day}` : '';
}

/**
 * Day / month / year entry (spec 01 §4). The three fields keep their own state so a half-typed date
 * is not thrown away; the parent only receives a value once all three parts are filled.
 *
 * Numerals stay Western and the fields stay left-to-right even in Arabic, so a date is never
 * reordered by the text direction.
 */
export function BirthDateField({
  value,
  onChange,
  error,
}: {
  /** Stored YYYY-MM-DD, or '' while incomplete. */
  value: string;
  onChange: (birthDate: string) => void;
  error?: string | null;
}) {
  const t = useT();
  const [parts, setParts] = useState<[string, string, string]>(() => split(value));

  // Re-sync when the draft changes from outside (e.g. restoring a resumed onboarding).
  useEffect(() => {
    const joined = join(parts[0], parts[1], parts[2]);
    if (value && value !== joined) setParts(split(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const set = (i: 0 | 1 | 2, raw: string) => {
    const next: [string, string, string] = [...parts];
    next[i] = raw.replace(/\D/g, '');
    setParts(next);
    onChange(join(next[0], next[1], next[2]));
  };

  const age = isValidBirthDate(value) ? ageFromBirthDate(value) : null;

  return (
    <Field
      label={t('onboarding.basics.birthDate')}
      error={error ?? null}
      hint={age !== null ? t('onboarding.basics.age', { age }) : t('onboarding.basics.ageHint')}
    >
      <View style={styles.row}>
        <TextField
          value={parts[0]}
          onChangeText={(v) => set(0, v)}
          placeholder={t('onboarding.basics.dd')}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={t('onboarding.basics.day')}
          style={[styles.input, styles.part]}
          testID="birth-day"
        />
        <TextField
          value={parts[1]}
          onChangeText={(v) => set(1, v)}
          placeholder={t('onboarding.basics.mm')}
          keyboardType="number-pad"
          maxLength={2}
          accessibilityLabel={t('onboarding.basics.month')}
          style={[styles.input, styles.part]}
          testID="birth-month"
        />
        <TextField
          value={parts[2]}
          onChangeText={(v) => set(2, v)}
          placeholder={t('onboarding.basics.yyyy')}
          keyboardType="number-pad"
          maxLength={4}
          accessibilityLabel={t('onboarding.basics.year')}
          style={[styles.input, styles.year]}
          testID="birth-year"
        />
      </View>
    </Field>
  );
}

/** Notice card used by the 18+ gate and by "religious matching is off". */
export function Notice({ title, body, tone = 'danger' }: { title: string; body: string; tone?: 'danger' | 'muted' }) {
  const danger = tone === 'danger';
  return (
    <View style={[noticeStyles.notice, danger ? noticeStyles.danger : noticeStyles.muted]}>
      <Text variant="bodyStrong" color={danger ? colors.danger : colors.text}>
        {title}
      </Text>
      <Text variant="small" color={colors.textMuted}>
        {body}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // A date is written left-to-right everywhere, including Arabic.
  row: { flexDirection: 'row', gap: spacing.sm },
  input: { textAlign: 'left', writingDirection: 'ltr', fontFamily: 'Inter_500Medium', letterSpacing: 1 },
  part: { flex: 1, minWidth: 0 },
  year: { flex: 1.4, minWidth: 0 },
});

const noticeStyles = StyleSheet.create({
  notice: { borderRadius: radii.xl, borderWidth: 1, padding: spacing.lg, gap: spacing.xs },
  danger: { backgroundColor: colors.dangerSoft, borderColor: '#EBC3CC' },
  muted: { backgroundColor: colors.bgMuted, borderColor: colors.borderSoft },
});
