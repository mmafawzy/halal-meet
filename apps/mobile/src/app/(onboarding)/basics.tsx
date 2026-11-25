import type { Gender, MaritalStatus } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BirthDateField, Notice } from '@/components/onboarding/BirthDateField';
import { CountrySheet } from '@/components/onboarding/CountrySheet';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { useOnboardingSave } from '@/components/onboarding/useOnboardingSave';
import { Button, Chip, ChipRow, Field, Icon, Segmented, Text, TextField } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { CITIES, LANGUAGES, languageLabel } from '@/lib/cities';
import { ageFromBirthDate, countryFlag, countryName } from '@/lib/format';
import { useSession, type ChildrenStatus } from '@/state/session';
import { colors, palette, radii, spacing } from '@/theme';

const MARITAL: MaritalStatus[] = ['never_married', 'divorced', 'widowed', 'annulled'];
const CHILDREN: ChildrenStatus[] = ['none', 'with_me', 'not_with_me'];

/** Screen 8 — the essentials: name, gender, age (18+ gate), country and city, languages, marital status, children. */
export default function BasicsScreen() {
  const t = useT();
  const locale = useLocale();
  const draft = useSession((s) => s.draft);
  const updateDraft = useSession((s) => s.updateDraft);
  const { save, saving } = useOnboardingSave();

  const [firstName, setFirstName] = useState(draft.firstName);
  const [gender, setGender] = useState<Gender | null>(draft.gender);
  const [birthDate, setBirthDate] = useState(draft.birthDate);
  const [nationality, setNationality] = useState<string[]>(draft.nationality);
  const [country, setCountry] = useState<string | null>(draft.country);
  const [city, setCity] = useState(draft.city);
  const [languages, setLanguages] = useState<string[]>(draft.languages.length ? draft.languages : [locale === 'ar' ? 'ar' : 'en']);
  const [maritalStatus, setMaritalStatus] = useState<MaritalStatus>(draft.maritalStatus ?? 'never_married');
  const [children, setChildren] = useState<ChildrenStatus | null>(draft.children);

  const [countryOpen, setCountryOpen] = useState(false);
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const age = birthDate ? ageFromBirthDate(birthDate) : null;
  const underage = age !== null && age < 18;
  const nameOk = firstName.trim().length > 0;
  const dateOk = age !== null && age >= 18 && age <= 110;
  const cityOk = city.trim().length > 0;
  const complete = nameOk && !!gender && dateOk && !!country && cityOk;

  const suggestions = country ? (CITIES[country] ?? []) : [];

  const toggleLanguage = (code: string) =>
    setLanguages((l) => (l.includes(code) ? l.filter((x) => x !== code) : [...l, code]));

  const patch = () => ({
    firstName: firstName.trim(),
    gender,
    birthDate,
    nationality,
    country,
    city: city.trim(),
    languages,
    maritalStatus,
    children,
  });

  const next = async () => {
    setAttempted(true);
    if (!complete) return;
    updateDraft({ ...patch(), gender });
    const ok = await save(patch());
    if (ok) router.push('/(onboarding)/photo');
  };

  return (
    <OnboardingFrame
      step="basics"
      title={t('onboarding.basics.title')}
      subtitle={t('onboarding.basics.subtitle')}
      keyboard
      footer={
        <Button
          label={t('common.actions.continue')}
          size="lg"
          fullWidth
          loading={saving}
          disabled={underage}
          onPress={() => void next()}
          testID="basics-continue"
        />
      }
    >
      <Field
        label={t('onboarding.basics.firstName')}
        hint={t('onboarding.basics.firstNameHint')}
        error={attempted && !nameOk ? t('onboarding.basics.required') : null}
      >
        <TextField
          value={firstName}
          onChangeText={setFirstName}
          placeholder={t('onboarding.basics.firstNamePlaceholder')}
          autoCapitalize="words"
          textContentType="givenName"
          accessibilityLabel={t('onboarding.basics.firstName')}
          testID="basics-first-name"
        />
      </Field>

      <Field label={t('onboarding.basics.gender')} hint={t('onboarding.basics.genderHint')} error={attempted && !gender ? t('onboarding.basics.required') : null}>
        <Segmented<Gender>
          options={[
            { value: 'male', label: t('common.gender.male') },
            { value: 'female', label: t('common.gender.female') },
          ]}
          value={gender ?? 'male'}
          onChange={setGender}
          style={gender ? undefined : { opacity: 0.6 }}
        />
      </Field>

      <BirthDateField
        value={birthDate}
        onChange={setBirthDate}
        error={attempted && !dateOk && !underage ? t('onboarding.basics.invalidDate') : null}
      />

      {underage ? <Notice title={t('onboarding.basics.underageTitle')} body={t('onboarding.basics.underageBody')} /> : null}

      <Field
        label={t('onboarding.basics.country')}
        error={attempted && !country ? t('onboarding.basics.required') : null}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('onboarding.basics.chooseCountry')}
          onPress={() => setCountryOpen(true)}
          style={({ pressed }) => [styles.picker, pressed && { backgroundColor: palette.sand100 }]}
          testID="basics-country"
        >
          <Text style={{ fontSize: 20, lineHeight: 26 }}>{country ? countryFlag(country) : '🌍'}</Text>
          <Text variant="body" weight={country ? 'medium' : 'regular'} color={country ? colors.text : colors.textSubtle} style={{ flex: 1 }}>
            {country ? countryName(country, locale) : t('onboarding.basics.chooseCountry')}
          </Text>
          <Icon name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>
      </Field>

      <Field
        label={t('onboarding.basics.city')}
        hint={t('onboarding.basics.cityHint')}
        error={attempted && !cityOk ? t('onboarding.basics.required') : null}
      >
        <TextField
          value={city}
          onChangeText={setCity}
          placeholder={t('onboarding.basics.cityPlaceholder')}
          accessibilityLabel={t('onboarding.basics.city')}
          testID="basics-city"
        />
      </Field>

      {suggestions.length > 0 ? (
        <ChipRow>
          {suggestions.map((c) => (
            <Chip
              key={c.en}
              size="sm"
              label={locale === 'ar' ? c.ar : c.en}
              selected={city === c.en}
              onPress={() => setCity(c.en)}
            />
          ))}
        </ChipRow>
      ) : null}

      <Field label={t('onboarding.basics.nationality')} hint={t('onboarding.basics.nationalityHint')}>
        <View style={{ gap: spacing.sm }}>
          {nationality.length > 0 ? (
            <ChipRow>
              {nationality.map((code) => (
                <Chip key={code} size="sm" label={`${countryFlag(code)} ${countryName(code, locale)}`} selected onPress={() => setNationality((n) => n.filter((x) => x !== code))} />
              ))}
            </ChipRow>
          ) : null}
          <Pressable
            accessibilityRole="button"
            onPress={() => setNationalityOpen(true)}
            style={({ pressed }) => [styles.picker, pressed && { backgroundColor: palette.sand100 }]}
          >
            <Icon name="add-circle-outline" size={18} color={colors.primary} />
            <Text variant="small" weight="semibold" color={colors.primary} style={{ flex: 1 }}>
              {t('common.actions.edit')}
            </Text>
          </Pressable>
        </View>
      </Field>

      <Field label={t('onboarding.basics.languages')}>
        <ChipRow>
          {LANGUAGES.map((l) => (
            <Chip key={l.code} label={languageLabel(l.code, locale)} selected={languages.includes(l.code)} onPress={() => toggleLanguage(l.code)} />
          ))}
        </ChipRow>
      </Field>

      <Field label={t('onboarding.basics.maritalLabel')}>
        <ChipRow>
          {MARITAL.map((m) => (
            <Chip key={m} label={t(`common.marital.${m}`)} selected={maritalStatus === m} onPress={() => setMaritalStatus(m)} />
          ))}
        </ChipRow>
      </Field>

      <Field label={t('onboarding.basics.children')}>
        <View style={{ gap: spacing.sm }}>
          {CHILDREN.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="radio"
              accessibilityState={{ checked: children === c }}
              onPress={() => setChildren(c)}
              style={({ pressed }) => [styles.option, children === c && styles.optionOn, pressed && children !== c && { backgroundColor: palette.sand100 }]}
            >
              <Text variant="body" weight={children === c ? 'semibold' : 'regular'} style={{ flex: 1 }}>
                {t(`common.children.${c}`)}
              </Text>
              <View style={[styles.radio, children === c && styles.radioOn]}>{children === c ? <Icon name="checkmark" size={13} color={palette.white} /> : null}</View>
            </Pressable>
          ))}
        </View>
      </Field>

      {attempted && !complete && !underage ? <InlineNote tone="danger" text={t('onboarding.basics.fixErrors')} /> : null}

      <CountrySheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        value={country}
        onSelect={(code) => {
          setCountry(code);
          if (city && !(CITIES[code] ?? []).some((c) => c.en === city)) setCity('');
        }}
        title={t('onboarding.basics.chooseCountry')}
      />
      <CountrySheet
        visible={nationalityOpen}
        onClose={() => setNationalityOpen(false)}
        value={null}
        onSelect={(code) => setNationality((n) => (n.includes(code) ? n : [...n, code]))}
        title={t('onboarding.basics.nationality')}
      />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
