import { useMutation, useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { api } from '@/api';
import { tokenStorage } from '@/api/tokenStorage';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Button, Icon, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, palette, radii, spacing } from '@/theme';

const CODE_LENGTH = 6;
const RESEND_SECONDS = 30;

/** Screen 5 — 6-digit OTP verification (auto-read on Android, resend timer, WhatsApp fallback). */
export default function OtpScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ phone?: string }>();
  const draftPhone = useSession((s) => s.draft.phone);
  const setToken = useSession((s) => s.setToken);
  const setStep = useSession((s) => s.setStep);
  const phone = params.phone ?? draftPhone;

  const [code, setCode] = useState('');
  const [seconds, setSeconds] = useState(RESEND_SECONDS);
  const [resent, setResent] = useState(false);
  const input = useRef<TextInput>(null);

  const verify = useMutation({
    mutationFn: (c: string) => api.otpVerify({ phone, code: c }),
    onSuccess: async (res) => {
      await tokenStorage.set(res.token);
      setToken(res.token, res.accountId);
      // Guardians signing in to accept an invitation go straight back to it — no member onboarding.
      const pendingGuardianCode = useSession.getState().pendingGuardianCode;
      if (pendingGuardianCode) {
        router.replace({ pathname: '/guardian/[code]', params: { code: pendingGuardianCode } });
        return;
      }
      // Returning accounts go through the splash gate, which reads GET /me and opens Discover, resumes
      // onboarding, or opens the guardian home. Only brand-new accounts start the member onboarding here.
      if (!res.isNew) {
        router.replace('/');
        return;
      }
      setStep('intention');
      router.replace('/(onboarding)/intention');
    },
  });

  const resend = useMutation({
    mutationFn: () => api.otpRequest({ phone }),
    onSuccess: () => {
      setResent(true);
      setSeconds(RESEND_SECONDS);
    },
  });

  const whatsapp = useMutation({ mutationFn: () => api.otpRequest({ phone }) });

  // Resend countdown.
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setTimeout(() => setSeconds((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [seconds]);

  const submit = (value: string) => {
    if (value.length !== CODE_LENGTH || verify.isPending) return;
    verify.mutate(value);
  };

  const onChange = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(next);
    if (next.length === CODE_LENGTH) submit(next); // auto-submit once the last digit lands
  };

  const boxes = useMemo(() => Array.from({ length: CODE_LENGTH }, (_, i) => code[i] ?? ''), [code]);

  return (
    <OnboardingFrame
      step="otp"
      title={t('onboarding.otp.title')}
      subtitle={t('onboarding.otp.subtitle', { phone })}
      hideBack
      footer={
        <>
          <Button
            label={t('onboarding.otp.verify')}
            size="lg"
            fullWidth
            loading={verify.isPending}
            disabled={code.length !== CODE_LENGTH}
            onPress={() => submit(code)}
            testID="otp-verify"
          />
          <Button
            label={t('onboarding.otp.change')}
            variant="ghost"
            fullWidth
            onPress={() => router.replace('/(onboarding)/phone')}
          />
        </>
      }
    >
      {/* One real input drives the six boxes, so pasting / autofill works and the keyboard opens once. */}
      <Pressable accessibilityRole="button" accessibilityLabel={t('onboarding.otp.codeLabel')} onPress={() => input.current?.focus()} style={styles.boxes}>
        {boxes.map((digit, i) => {
          const filled = digit !== '';
          const caret = code.length === i;
          return (
            <View key={i} style={[styles.box, filled && styles.boxFilled, caret && styles.boxCaret]}>
              <Text variant="title" fontLocale="en" color={colors.text}>
                {digit}
              </Text>
            </View>
          );
        })}
      </Pressable>

      <TextInput
        ref={input}
        value={code}
        autoFocus
        onChangeText={onChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        maxLength={CODE_LENGTH}
        accessibilityLabel={t('onboarding.otp.codeLabel')}
        style={styles.hiddenInput}
        testID="otp-input"
      />

      {verify.isError ? <InlineNote tone="danger" text={t('onboarding.otp.invalid')} /> : null}
      {resent ? <InlineNote tone="primary" icon="checkmark-circle-outline" text={t('onboarding.otp.resent')} /> : null}
      {whatsapp.isSuccess ? <InlineNote tone="primary" icon="logo-whatsapp" text={t('onboarding.otp.whatsapp')} /> : null}

      <View style={styles.links}>
        <Pressable
          accessibilityRole="button"
          disabled={seconds > 0 || resend.isPending}
          onPress={() => resend.mutate()}
          style={styles.link}
        >
          <Icon name="refresh" size={16} color={seconds > 0 ? colors.textSubtle : colors.primary} />
          <Text variant="small" weight="semibold" color={seconds > 0 ? colors.textSubtle : colors.primary}>
            {seconds > 0 ? t('onboarding.otp.resendIn', { s: seconds }) : t('onboarding.otp.resend')}
          </Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => whatsapp.mutate()} style={styles.link}>
          <Icon name="logo-whatsapp" size={16} color={colors.primary} />
          <Text variant="small" weight="semibold" color={colors.primary}>
            {t('onboarding.otp.whatsapp')}
          </Text>
        </Pressable>
      </View>

      <InlineNote text={t('onboarding.otp.demo')} />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'space-between' },
  box: {
    flex: 1,
    height: 60,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  boxFilled: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  boxCaret: { borderColor: colors.primary },
  // The visible boxes are decorative; this is the keyboard target, kept out of the way rather than
  // display:none so iOS still raises the keyboard.
  hiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1, end: 0, top: 0, minHeight: 0, padding: 0, borderWidth: 0 },
  links: { gap: spacing.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.xs },
});
