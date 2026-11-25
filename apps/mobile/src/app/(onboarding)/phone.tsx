import { COUNTRIES_BY_CODE } from '@halal-meet/core';
import { useMutation } from '@tanstack/react-query';
import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { CheckRow, CountrySheet } from '@/components/onboarding/CountrySheet';
import { DIAL_CODES, getReligiousConsent, setReligiousConsent } from '@/components/onboarding/draft';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Button, Divider, Field, Icon, TextField } from '@/components/ui';
import { Text } from '@/components/ui';
import { useIsRTL, useT } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, palette, radii, spacing } from '@/theme';

/** Best guess for the dial code: device region if it is a launch country, else Egypt. */
function initialCountry(): string {
  try {
    const region = getLocales()[0]?.regionCode ?? '';
    if (region && DIAL_CODES[region]) return region;
  } catch {
    // ignore — fall back below
  }
  return 'EG';
}

/** Splits a stored "+20…" phone back into country + national number (for editing after "Change number"). */
function splitPhone(phone: string): { country: string; number: string } | null {
  if (!phone.startsWith('+')) return null;
  const digits = phone.slice(1);
  // Longest dial-code match first (e.g. 966 before 9…).
  const match = Object.entries(DIAL_CODES)
    .sort((a, b) => b[1].length - a[1].length)
    .find(([, code]) => digits.startsWith(code));
  return match ? { country: match[0], number: digits.slice(match[1].length) } : null;
}

/** Screen 4 — sign up with phone number + consents. */
export default function PhoneScreen() {
  const t = useT();
  const rtl = useIsRTL();
  const draftPhone = useSession((s) => s.draft.phone);
  const updateDraft = useSession((s) => s.updateDraft);
  const initial = useMemo(() => splitPhone(draftPhone), [draftPhone]);

  const [country, setCountry] = useState(initial?.country ?? initialCountry());
  const [number, setNumber] = useState(initial?.number ?? '');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [religious, setReligious] = useState(getReligiousConsent() ?? false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const digits = number.replace(/\D/g, '').replace(/^0+/, '');
  const numberValid = digits.length >= 7 && digits.length <= 13;
  const consentsOk = terms && privacy;
  const phone = `+${DIAL_CODES[country]}${digits}`;

  const request = useMutation({ mutationFn: (p: string) => api.otpRequest({ phone: p }) });

  const submit = async () => {
    setAttempted(true);
    if (!numberValid || !consentsOk) return;
    setReligiousConsent(religious);
    updateDraft({ phone });
    try {
      await request.mutateAsync(phone);
      router.push({ pathname: '/(onboarding)/otp', params: { phone } });
    } catch {
      // error shown inline below
    }
  };

  const info = COUNTRIES_BY_CODE[country];

  return (
    <OnboardingFrame
      step="phone"
      title={t('onboarding.phone.title')}
      subtitle={t('onboarding.phone.subtitle')}
      keyboard
      footer={
        <Button
          label={t('onboarding.phone.send')}
          size="lg"
          fullWidth
          loading={request.isPending}
          disabled={attempted && (!numberValid || !consentsOk)}
          onPress={() => void submit()}
          testID="phone-send"
        />
      }
    >
      <Field label={t('onboarding.phone.number')} error={attempted && !numberValid ? t('onboarding.phone.invalid') : null}>
        {/* Phone numbers are always written left-to-right, even in Arabic. */}
        <View style={[styles.phoneRow, rtl ? { flexDirection: 'row-reverse' } : null]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('onboarding.phone.countryCode')}
            onPress={() => setPickerOpen(true)}
            style={({ pressed }) => [styles.dial, pressed && { backgroundColor: palette.sand100 }]}
          >
            <Text style={{ fontSize: 20, lineHeight: 26 }}>{info?.flag}</Text>
            <Text variant="bodyStrong" fontLocale="en">
              +{DIAL_CODES[country]}
            </Text>
            <Icon name="chevron-down" size={14} color={colors.textMuted} />
          </Pressable>
          <TextField
            value={number}
            onChangeText={(v) => setNumber(v.replace(/[^\d ]/g, ''))}
            placeholder={t('onboarding.phone.placeholder')}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={16}
            accessibilityLabel={t('onboarding.phone.number')}
            style={styles.number}
            onSubmitEditing={() => void submit()}
            testID="phone-input"
          />
        </View>
      </Field>

      <View style={styles.consents}>
        <CheckRow checked={terms} onChange={setTerms} label={t('onboarding.phone.terms')} testID="consent-terms" />
        <CheckRow checked={privacy} onChange={setPrivacy} label={t('onboarding.phone.privacy')} testID="consent-privacy" />
        <Divider style={{ marginVertical: spacing.xs }} />
        <CheckRow checked={religious} onChange={setReligious} label={t('onboarding.phone.religious')} description={t('onboarding.phone.religiousHint')} />
      </View>

      {attempted && !consentsOk ? <InlineNote tone="danger" text={t('onboarding.phone.required')} /> : null}
      {request.isError ? <InlineNote tone="danger" text={t('common.states.error')} /> : null}

      <CountrySheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        value={country}
        onSelect={setCountry}
        title={t('onboarding.phone.chooseCountry')}
        showDialCode
      />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  phoneRow: { flexDirection: 'row', gap: spacing.sm },
  dial: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 50,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  number: { flex: 1, textAlign: 'left', writingDirection: 'ltr', fontFamily: 'Inter_500Medium', letterSpacing: 0.5 },
  consents: {
    backgroundColor: colors.card,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
});
