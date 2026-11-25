import type { HalalMode, Intention, MaritalStatus, ProfileInput } from '@halal-meet/core';
import { router } from 'expo-router';
import { useMemo, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { BirthDateField, Notice } from '@/components/onboarding/BirthDateField';
import { CountrySheet } from '@/components/onboarding/CountrySheet';
import { HALAL_MODES, INTENTIONS, isValidBirthDate } from '@/components/onboarding/draft';
import { InlineNote } from '@/components/onboarding/OnboardingFrame';
import { ConfirmSheet } from '@/components/me/ConfirmSheet';
import { toProfileInput } from '@/components/me/profileInput';
import { useSaveProfile } from '@/components/me/useSaveProfile';
import {
  Button,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  Field,
  Header,
  Icon,
  LoadingState,
  Screen,
  SectionTitle,
  Text,
  TextField,
  ToggleRow,
} from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { CITIES, LANGUAGES, languageLabel } from '@/lib/cities';
import { ageFromBirthDate, countryFlag, countryName } from '@/lib/format';
import { colors, palette, radii, spacing } from '@/theme';

const MARITAL: MaritalStatus[] = ['never_married', 'divorced', 'widowed', 'annulled'];
const EDUCATION = ['secondary', 'diploma', 'bachelors', 'masters', 'doctorate', 'religious', 'other'] as const;
const ABOUT_MAX = 500;

/** Canonical body sent to the API (also used to detect unsaved changes). */
function normalize(f: ProfileInput, heightCm: number | null): ProfileInput {
  return {
    ...f,
    firstName: f.firstName.trim(),
    city: f.city.trim(),
    heightCm,
    profession: f.profession?.trim() || null,
    about: f.about?.trim() || null,
    acceptedModes: HALAL_MODES.filter((m) => m === f.halalMode || f.acceptedModes.includes(m)),
    relocateCountries: f.openToRelocate ? f.relocateCountries : [],
  };
}

/** Edit profile (screen 56 → edit). Sends the full profile to PUT /me/profile. */
export default function EditProfileScreen() {
  const t = useT();
  const { me, profile } = useSaveProfile();

  if (me.isLoading) return <Shell><LoadingState /></Shell>;
  if (me.isError) return <Shell><ErrorState onRetry={() => void me.refetch()} /></Shell>;
  if (!profile) {
    return (
      <Shell>
        <EmptyState
          icon="person-outline"
          title={t('me.empty.title')}
          body={t('me.empty.body')}
          action={<Button label={t('me.empty.cta')} onPress={() => router.replace('/')} />}
        />
      </Shell>
    );
  }
  return <EditForm initial={toProfileInput(profile)} />;
}

function Shell({ children }: { children: ReactNode }) {
  const t = useT();
  return <Screen header={<Header title={t('me.edit.title')} />}>{children}</Screen>;
}

function EditForm({ initial }: { initial: ProfileInput }) {
  const t = useT();
  const locale = useLocale();
  const { save, saving } = useSaveProfile();

  const [form, setForm] = useState<ProfileInput>(initial);
  const [heightText, setHeightText] = useState(initial.heightCm ? String(initial.heightCm) : '');
  const [countryOpen, setCountryOpen] = useState(false);
  const [nationalityOpen, setNationalityOpen] = useState(false);
  const [relocateOpen, setRelocateOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const set = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) => setForm((f) => ({ ...f, [key]: value }));
  const toggleIn = <T extends string>(list: T[], v: T): T[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const age = form.birthDate && isValidBirthDate(form.birthDate) ? ageFromBirthDate(form.birthDate) : null;
  const underage = age !== null && age < 18;
  const nameOk = form.firstName.trim().length > 0;
  const dateOk = age !== null && age >= 18 && age <= 110;
  const cityOk = form.city.trim().length > 0;
  const heightNum = heightText.trim() ? Number(heightText) : null;
  const heightOk = heightNum === null || (Number.isInteger(heightNum) && heightNum >= 120 && heightNum <= 230);
  const valid = nameOk && dateOk && cityOk && heightOk && !!form.country;

  const final = useMemo(() => normalize(form, heightOk ? heightNum : (form.heightCm ?? null)), [form, heightNum, heightOk]);
  const baseline = useMemo(() => JSON.stringify(normalize(initial, initial.heightCm ?? null)), [initial]);
  const dirty = JSON.stringify(final) !== baseline;

  const submit = async () => {
    setAttempted(true);
    if (!valid) return;
    const ok = await save(final, t('me.edit.saved'));
    if (ok) router.back();
  };

  const back = () => (dirty ? setLeaveOpen(true) : router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'));
  const suggestions = CITIES[form.country] ?? [];

  return (
    <Screen
      keyboard
      header={<Header title={t('me.edit.title')} subtitle={t('me.edit.subtitle')} onBack={back} />}
      footer={
        <Button
          label={t('me.edit.save')}
          size="lg"
          fullWidth
          loading={saving}
          disabled={!dirty || underage}
          onPress={() => void submit()}
          testID="edit-save"
        />
      }
      testID="edit-screen"
    >
      <View style={{ gap: spacing.lg }}>
        <SectionTitle title={t('me.edit.sections.basics')} style={{ marginBottom: 0 }} />

        <Field label={t('onboarding.basics.firstName')} hint={t('onboarding.basics.firstNameHint')} error={attempted && !nameOk ? t('onboarding.basics.required') : null}>
          <TextField
            value={form.firstName}
            onChangeText={(v) => set('firstName', v)}
            autoCapitalize="words"
            accessibilityLabel={t('onboarding.basics.firstName')}
            testID="edit-first-name"
          />
        </Field>

        <Field label={t('me.edit.gender')} hint={t('me.edit.genderLocked')}>
          <View style={[styles.picker, { backgroundColor: palette.sand100 }]}>
            <Icon name="lock-closed-outline" size={16} color={colors.textMuted} />
            <Text variant="body" color={colors.textMuted}>
              {t(`common.gender.${form.gender}`)}
            </Text>
          </View>
        </Field>

        <BirthDateField
          value={form.birthDate}
          onChange={(v) => set('birthDate', v)}
          error={attempted && !dateOk && !underage ? t('onboarding.basics.invalidDate') : null}
        />
        {underage ? <Notice title={t('onboarding.basics.underageTitle')} body={t('onboarding.basics.underageBody')} /> : null}

        <Field label={t('onboarding.basics.country')}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.basics.chooseCountry')}
            onPress={() => setCountryOpen(true)}
            style={({ pressed }) => [styles.picker, pressed && { backgroundColor: palette.sand100 }]}
            testID="edit-country"
          >
            <Text style={{ fontSize: 20, lineHeight: 26 }}>{countryFlag(form.country)}</Text>
            <Text variant="body" weight="medium" style={{ flex: 1 }}>
              {countryName(form.country, locale)}
            </Text>
            <Icon name="chevron-down" size={16} color={colors.textMuted} />
          </Pressable>
        </Field>

        <Field label={t('onboarding.basics.city')} hint={t('onboarding.basics.cityHint')} error={attempted && !cityOk ? t('onboarding.basics.required') : null}>
          <TextField value={form.city} onChangeText={(v) => set('city', v)} placeholder={t('onboarding.basics.cityPlaceholder')} accessibilityLabel={t('onboarding.basics.city')} testID="edit-city" />
        </Field>
        {suggestions.length > 0 ? (
          <ChipRow>
            {suggestions.map((c) => (
              <Chip key={c.en} size="sm" label={locale === 'ar' ? c.ar : c.en} selected={form.city === c.en} onPress={() => set('city', c.en)} />
            ))}
          </ChipRow>
        ) : null}

        <Field label={t('onboarding.basics.nationality')} hint={t('onboarding.basics.nationalityHint')}>
          <ChipRow>
            {form.nationality.map((code) => (
              <Chip
                key={code}
                size="sm"
                icon="close"
                label={`${countryFlag(code)} ${countryName(code, locale)}`}
                selected
                onPress={() => set('nationality', form.nationality.filter((x) => x !== code))}
              />
            ))}
            <Chip size="sm" icon="add" label={t('me.edit.addCountry')} onPress={() => setNationalityOpen(true)} />
          </ChipRow>
        </Field>

        <Field label={t('onboarding.basics.languages')}>
          <ChipRow>
            {LANGUAGES.map((l) => (
              <Chip key={l.code} label={languageLabel(l.code, locale)} selected={form.languages.includes(l.code)} onPress={() => set('languages', toggleIn(form.languages, l.code))} />
            ))}
          </ChipRow>
        </Field>

        <SectionTitle title={t('me.edit.sections.life')} style={{ marginTop: spacing.md, marginBottom: 0 }} />

        <Field label={t('me.edit.height')} error={!heightOk ? t('me.edit.heightInvalid') : null}>
          <TextField
            value={heightText}
            onChangeText={(v) => setHeightText(v.replace(/\D/g, '').slice(0, 3))}
            keyboardType="number-pad"
            placeholder={t('me.edit.heightPlaceholder')}
            accessibilityLabel={t('me.edit.height')}
            style={{ writingDirection: 'ltr' }}
            testID="edit-height"
          />
        </Field>

        <Field label={t('me.edit.education')}>
          <ChipRow>
            {EDUCATION.map((e) => (
              <Chip key={e} label={t(`me.edit.educationLevels.${e}`)} selected={form.educationLevel === e} onPress={() => set('educationLevel', form.educationLevel === e ? null : e)} />
            ))}
          </ChipRow>
        </Field>

        <Field label={t('me.edit.profession')}>
          <TextField
            value={form.profession ?? ''}
            onChangeText={(v) => set('profession', v)}
            placeholder={t('me.edit.professionPlaceholder')}
            accessibilityLabel={t('me.edit.profession')}
            testID="edit-profession"
          />
        </Field>

        <SectionTitle title={t('me.edit.sections.marriage')} style={{ marginTop: spacing.md, marginBottom: 0 }} />

        <Field label={t('me.edit.intention')}>
          <ChipRow>
            {INTENTIONS.map((i: Intention) => (
              <Chip key={i} label={t(`common.intentionShort.${i}`)} selected={form.intention === i} onPress={() => set('intention', i)} />
            ))}
          </ChipRow>
        </Field>

        <Field label={t('me.edit.halalMode')}>
          <ChipRow>
            {HALAL_MODES.map((m: HalalMode) => (
              <Chip key={m} label={t(`common.halalMode.${m}`)} selected={form.halalMode === m} onPress={() => set('halalMode', m)} />
            ))}
          </ChipRow>
        </Field>

        <Field label={t('me.edit.acceptedModes')} hint={t('onboarding.halalMode.acceptHint')}>
          <ChipRow>
            {HALAL_MODES.map((m) => (
              <Chip
                key={m}
                size="sm"
                label={t(`common.halalModeShort.${m}`)}
                selected={m === form.halalMode || form.acceptedModes.includes(m)}
                disabled={m === form.halalMode}
                onPress={() => set('acceptedModes', toggleIn(form.acceptedModes, m))}
              />
            ))}
          </ChipRow>
        </Field>

        <Field label={t('onboarding.basics.maritalLabel')}>
          <ChipRow>
            {MARITAL.map((m) => (
              <Chip key={m} label={t(`common.marital.${m}`)} selected={form.maritalStatus === m} onPress={() => set('maritalStatus', m)} />
            ))}
          </ChipRow>
        </Field>

        <View style={styles.group}>
          <ToggleRow label={t('me.edit.hasChildren')} value={form.hasChildren} onChange={(v) => set('hasChildren', v)} />
          <View style={styles.sep} />
          <ToggleRow label={t('me.edit.relocate')} description={t('me.edit.relocateBody')} value={form.openToRelocate} onChange={(v) => set('openToRelocate', v)} />
        </View>

        {form.openToRelocate ? (
          <Field label={t('me.edit.relocateCountries')}>
            <ChipRow>
              {form.relocateCountries.map((code) => (
                <Chip
                  key={code}
                  size="sm"
                  icon="close"
                  label={`${countryFlag(code)} ${countryName(code, locale)}`}
                  selected
                  onPress={() => set('relocateCountries', form.relocateCountries.filter((x) => x !== code))}
                />
              ))}
              <Chip size="sm" icon="add" label={t('me.edit.addCountry')} onPress={() => setRelocateOpen(true)} />
            </ChipRow>
          </Field>
        ) : null}

        <SectionTitle title={t('me.edit.sections.about')} style={{ marginTop: spacing.md, marginBottom: 0 }} />

        <Field hint={t('me.edit.aboutCount', { n: (form.about ?? '').length, max: ABOUT_MAX })}>
          <TextField
            value={form.about ?? ''}
            onChangeText={(v) => set('about', v.slice(0, ABOUT_MAX))}
            multiline
            placeholder={t('me.edit.aboutPlaceholder')}
            accessibilityLabel={t('me.edit.about')}
            testID="edit-about"
          />
        </Field>

        {attempted && !valid && !underage ? <InlineNote tone="danger" text={t('onboarding.basics.fixErrors')} /> : null}
      </View>

      <CountrySheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        value={form.country}
        onSelect={(code) => {
          setForm((f) => ({ ...f, country: code, city: (CITIES[code] ?? []).some((c) => c.en === f.city) ? f.city : '' }));
        }}
        title={t('onboarding.basics.chooseCountry')}
      />
      <CountrySheet
        visible={nationalityOpen}
        onClose={() => setNationalityOpen(false)}
        value={null}
        onSelect={(code) => set('nationality', form.nationality.includes(code) ? form.nationality : [...form.nationality, code])}
        title={t('onboarding.basics.nationality')}
      />
      <CountrySheet
        visible={relocateOpen}
        onClose={() => setRelocateOpen(false)}
        value={null}
        onSelect={(code) => set('relocateCountries', form.relocateCountries.includes(code) ? form.relocateCountries : [...form.relocateCountries, code])}
        title={t('me.edit.relocateCountries')}
      />
      <ConfirmSheet
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t('me.edit.discardTitle')}
        body={t('me.edit.discardBody')}
        confirmLabel={t('me.edit.discard')}
        cancelLabel={t('me.edit.keepEditing')}
        danger
        onConfirm={() => {
          setLeaveOpen(false);
          if (router.canGoBack()) router.back();
          else router.replace('/(tabs)/profile');
        }}
      />
    </Screen>
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
  group: { backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
});
