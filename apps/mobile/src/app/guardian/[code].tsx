import { GUARDIAN_PERMISSIONS, type Locale } from '@halal-meet/core';
import { getLocales } from 'expo-localization';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { useAcceptGuardianInvite, useGuardianInvitePreview, useGuardianLinks } from '@/api/hooks';
import { apiError, cleanInviteCode, guardianGender, PERMISSION_ICONS, GUARDIAN_HOME } from '@/components/family/shared';
import { Button, Card, ErrorState, Header, Icon, LoadingState, Screen, Text, Wordmark } from '@/components/ui';
import { i18n, useLocale, useT, useTs, type TParams } from '@/i18n';
import { applyLocale } from '@/i18n/rtl';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

function deviceLocale(): Locale {
  try {
    return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

/**
 * Guardian invitation landing (`https://halalmeet.app/g/<code>` → `/guardian/<code>`).
 * Shows the public preview (GET /guardian-invites/:code, no sign-in), explains the role and what is
 * shared, then accepts (POST /guardian-invites/:code/accept). Signed-out guardians verify their phone
 * through the onboarding phone/OTP screens and come straight back here — never through member onboarding.
 */
export default function GuardianInviteScreen() {
  const t = useT();
  const ts = useTs();
  const locale = useLocale();
  const { code: raw } = useLocalSearchParams<{ code: string }>();
  const code = cleanInviteCode(raw);
  const token = useSession((s) => s.token);
  const sessionLocale = useSession((s) => s.locale);
  const setPending = useSession((s) => s.setPendingGuardianCode);
  const showToast = useUi((s) => s.showToast);

  const preview = useGuardianInvitePreview(code || undefined);
  const accept = useAcceptGuardianInvite();
  const links = useGuardianLinks(!!token);

  // Opened straight from a link before any language was chosen: follow the device (Arabic first).
  useEffect(() => {
    if (sessionLocale) return;
    if (Platform.OS !== 'web') setPending(code); // a native RTL reload comes back here
    void applyLocale(deviceLocale());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leave = () => {
    setPending(null);
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };

  const switchLanguage = () => {
    if (Platform.OS !== 'web') setPending(code); // a native RTL reload comes back here
    void applyLocale(locale === 'ar' ? 'en' : 'ar');
  };

  const signIn = () => {
    setPending(code);
    router.push('/(onboarding)/phone');
  };

  const onAccept = () => {
    accept.mutate(code, {
      onSuccess: (link) => {
        const s = useSession.getState();
        s.setPendingGuardianCode(null);
        if (!s.onboardingDone) {
          // Guardian-only account: open the guardian area on launch, and address them by the relationship's gender.
          s.setGuardianOnly(true);
          if (!s.draft.gender) s.setGender(guardianGender(link.relationship));
        }
        showToast({ message: ts('family.guardianSide.invite.accepted', guardianGender(link.relationship)), tone: 'success' });
        router.replace({ pathname: '/guardian/member/[memberId]', params: { memberId: link.memberId } });
      },
    });
  };

  const demoCode = api.dev?.demoGuardianInviteCode;
  const openDemo = demoCode && demoCode !== code ? () => router.replace({ pathname: '/guardian/[code]', params: { code: demoCode } }) : null;
  const hasLinks = (links.data?.length ?? 0) > 0;

  const header = (
    <Header
      onBack={leave}
      right={
        <Button
          label={t('family.guardianSide.invite.switchLanguage')}
          variant="ghost"
          size="sm"
          onPress={switchLanguage}
          testID="guardian-invite-language"
        />
      }
    />
  );

  // ── Error outcomes (invalid / own invitation / already accepted) ──
  const previewErr = apiError(preview.error);
  const acceptErr = apiError(accept.error);
  const outcome: 'invalid' | 'self' | 'already' | null =
    acceptErr?.code === 'cannot_guard_self'
      ? 'self'
      : acceptErr?.status === 409
        ? 'already'
        : acceptErr?.status === 404 || previewErr?.status === 404 || (!code && !preview.isLoading)
          ? 'invalid'
          : null;

  if (outcome) {
    const g = preview.data ? guardianGender(preview.data.relationship) : 'male';
    const title = t(`family.guardianSide.invite.${outcome}Title`);
    const body = ts(`family.guardianSide.invite.${outcome}Body`, g);
    return (
      <Screen header={header} pattern testID="guardian-invite-screen">
        <Card>
          <View style={{ gap: spacing.md, alignItems: 'center' }} testID={`guardian-invite-${outcome}`}>
            <Icon name={outcome === 'already' ? 'checkmark-circle-outline' : 'mail-unread-outline'} size={40} color={colors.textMuted} />
            <Text variant="heading" center>
              {title}
            </Text>
            <Text variant="body" color={colors.textMuted} center>
              {body}
            </Text>
            {outcome === 'self' && api.dev ? (
              <Text variant="small" color={colors.textSubtle} center>
                {t('family.guardianSide.invite.selfDemo')}
              </Text>
            ) : null}
          </View>
        </Card>
        <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
          {hasLinks || outcome === 'already' ? (
            <Button
              label={t('family.guardianSide.invite.openGuardianArea')}
              icon="people-circle-outline"
              size="lg"
              fullWidth
              onPress={() => router.replace(GUARDIAN_HOME)}
              testID="guardian-invite-open-area"
            />
          ) : null}
          {openDemo ? (
            <Button label={t('family.guardianSide.invite.tryDemo')} icon="flask-outline" variant="outline" fullWidth onPress={openDemo} testID="guardian-invite-try-demo" />
          ) : null}
          <Button label={t('common.actions.back')} variant="ghost" fullWidth onPress={leave} />
        </View>
      </Screen>
    );
  }

  if (preview.isLoading) {
    return (
      <Screen header={header} pattern scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (preview.isError || !preview.data) {
    return (
      <Screen header={header} pattern scroll={false}>
        <ErrorState onRetry={() => void preview.refetch()} />
      </Screen>
    );
  }

  const p = preview.data;
  const g = guardianGender(p.relationship);
  const name = p.memberFirstName;
  /**
   * Copy about the member AND addressed to the guardian: Arabic keys `key__<member>_<guardian>` (he/she from
   * `memberGender`, then from the relationship). Falls back to the guardian-gendered key when the member's
   * gender is unknown (or in English).
   */
  const tm = (key: string, params?: TParams): string => {
    if (p.memberGender) {
      const k = `${key}__${p.memberGender === 'female' ? 'she' : 'he'}_${g === 'female' ? 'she' : 'he'}`;
      if (i18n.exists(k)) return String(i18n.t(k, params));
    }
    return ts(key, g, params);
  };

  const footer = token ? (
    <Button
      label={t('family.guardianSide.invite.accept')}
      icon="checkmark-circle-outline"
      size="lg"
      fullWidth
      haptic
      loading={accept.isPending}
      onPress={onAccept}
      testID="guardian-invite-accept"
    />
  ) : (
    <>
      <Button label={t('family.guardianSide.invite.signInToAccept')} icon="call-outline" size="lg" fullWidth onPress={signIn} testID="guardian-invite-signin" />
      <Text variant="small" color={colors.textMuted} center>
        {ts('family.guardianSide.invite.signInHint', g)}
      </Text>
    </>
  );

  return (
    <Screen header={header} footer={footer} pattern testID="guardian-invite-screen">
      <View style={{ alignItems: 'center', marginBottom: spacing.lg }}>
        <Wordmark size={18} />
      </View>

      <View style={{ gap: spacing.md, marginBottom: spacing.xl }}>
        <Text variant="overline" color={colors.primary}>
          {t('family.guardianSide.invite.title')}
        </Text>
        <Text variant="display" testID="guardian-invite-role">
          {tm('family.guardianSide.invite.role', { name })}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {t('family.guardianSide.invite.relationshipLine', { relationship: t(`family.invite.relationships.${p.relationship}`) })}
        </Text>
      </View>

      <Card>
        <View style={{ gap: spacing.md }} testID="guardian-invite-permissions">
          <Text variant="heading">{tm('family.guardianSide.invite.shared', { name })}</Text>
          {GUARDIAN_PERMISSIONS.map((perm) => {
            const on = p.permissions[perm];
            return (
              <View key={perm} style={styles.permRow} testID={`guardian-invite-perm-${perm}`}>
                <View style={[styles.permIcon, { backgroundColor: on ? colors.primaryTint : palette.sand100 }]}>
                  <Icon name={on ? PERMISSION_ICONS[perm] : 'remove-outline'} size={20} color={on ? colors.primary : colors.textSubtle} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="subheading" color={on ? colors.text : colors.textSubtle}>
                    {t(`family.invite.permission.${perm}.label`)}
                  </Text>
                  <Text variant="small" color={colors.textMuted}>
                    {on ? t(`family.invite.permission.${perm}.desc`) : t('family.guardianSide.invite.notShared')}
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      </Card>

      <View style={[styles.note, { marginTop: spacing.lg }]}>
        <Icon name="eye-outline" size={18} color={colors.textMuted} style={{ marginTop: 2 }} />
        <Text variant="body" color={colors.textMuted} style={{ flex: 1 }}>
          {ts('family.guardianSide.invite.noBrowse', g)}
        </Text>
      </View>

      {accept.isError && !outcome ? (
        <Text variant="small" color={colors.danger} style={{ marginTop: spacing.md }}>
          {t('common.states.error')}
        </Text>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  permRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  permIcon: { width: 40, height: 40, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
