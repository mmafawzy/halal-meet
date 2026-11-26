import type { IntlVisibility, PhotoVisibility } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useSaveProfile } from '@/components/me/useSaveProfile';
import { PHOTO_VISIBILITIES, PHOTO_VISIBILITY_ICONS } from '@/components/onboarding/draft';
import { InlineNote } from '@/components/onboarding/OnboardingFrame';
import { PhotoRequestsSection } from '@/components/photos/PhotoRequestsSection';
import { AccountStateCard } from '@/components/privacy/AccountStateCard';
import { ConsentsSection } from '@/components/privacy/ConsentsSection';
import { DeleteAccountSheet } from '@/components/privacy/DeleteAccountSheet';
import { isApiError } from '@/components/privacy/errors';
import { useDataExport } from '@/components/privacy/useDataExport';
import { usePause, usePrivacyStatus, useResume, useSetIncognito } from '@/components/privacy/usePrivacy';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  EmptyState,
  ErrorState,
  Header,
  ListRow,
  LoadingState,
  OptionCard,
  RowGroup,
  Screen,
  Segmented,
  SectionTitle,
  Sheet,
  Tag,
  Text,
  ToggleRow,
} from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

const INTL: IntlVisibility[] = ['on', 'relocating_only', 'off'];
type PauseOption = 'week' | 'month' | 'manual';

/**
 * Privacy center (screen 58, spec 05). Never paywalled, except Incognito (Plus and above).
 * Pause, incognito, consents, data export and deletion are stored on the server (PRIVACY_ROUTES).
 */
export default function PrivacyScreen() {
  const t = useT();
  const locale = useLocale();
  const { me, profile, save } = useSaveProfile();
  const status = usePrivacyStatus();
  const pause = usePause();
  const resume = useResume();
  const incognito = useSetIncognito();
  const exportData = useDataExport();

  const [photo, setPhoto] = useState<PhotoVisibility | null>(null);
  const [intl, setIntl] = useState<IntlVisibility | null>(null);
  const [pauseChoice, setPauseChoice] = useState<PauseOption>('week');
  const [conversationsSoon, setConversationsSoon] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const header = <Header title={t('me.privacy.title')} />;
  if (me.isLoading || status.isLoading) return <Screen header={header}><LoadingState /></Screen>;
  if (me.isError || status.isError || !status.data) {
    return (
      <Screen header={header}>
        <ErrorState onRetry={() => void Promise.all([me.refetch(), status.refetch()])} />
      </Screen>
    );
  }
  const s = status.data;
  const restricted = s.state === 'deletion_pending' || s.state === 'suspended' || s.state === 'banned';

  const dataSection = (
    <RowGroup title={t('me.privacy.data')}>
      <ListRow icon="download-outline" label={t('me.privacy.export')} description={t('me.privacy.exportBody')} onPress={() => exportData.mutate()} />
      {!restricted ? (
        <ListRow icon="chatbubbles-outline" label={t('me.privacy.deleteConversations')} right={<Tag label={t('me.privacy.comingSoon')} />} onPress={() => setConversationsSoon(true)} />
      ) : null}
      {s.state !== 'deletion_pending' ? (
        <ListRow icon="trash-outline" danger label={t('me.privacy.deleteAccount')} description={t('me.privacy.deleteAccountBody')} onPress={() => setDeleteOpen(true)} />
      ) : null}
    </RowGroup>
  );

  const sheets = (
    <>
      <DeleteAccountSheet visible={deleteOpen} onClose={() => setDeleteOpen(false)} graceDays={s.graceDays} />
      <Sheet
        visible={conversationsSoon}
        onClose={() => setConversationsSoon(false)}
        title={t('me.privacy.comingSoonTitle')}
        footer={<Button label={t('common.actions.gotIt')} fullWidth onPress={() => setConversationsSoon(false)} />}
      >
        <Text variant="body" color={colors.textMuted}>
          {t('me.privacy.conversationsSoon')}
        </Text>
      </Sheet>
    </>
  );

  // Suspended, closed or deletion-pending accounts only see their state, the export and deletion.
  if (restricted) {
    return (
      <Screen header={header} testID="privacy-screen">
        <View style={{ gap: spacing.xl }}>
          <AccountStateCard status={s} />
          {dataSection}
        </View>
        {sheets}
      </Screen>
    );
  }

  if (!profile || !me.data) {
    return (
      <Screen header={header}>
        <EmptyState icon="person-outline" title={t('me.empty.title')} body={t('me.empty.body')} action={<Button label={t('me.empty.cta')} onPress={() => router.replace('/')} />} />
      </Screen>
    );
  }

  const photoValue = photo ?? profile.photoVisibility;
  const intlValue = intl ?? profile.intlVisibility ?? 'on';
  const toastError = () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' });

  const changePhoto = async (v: PhotoVisibility) => {
    setPhoto(v);
    const ok = await save({ photoVisibility: v }, t('me.privacy.saved'));
    if (!ok) setPhoto(null);
  };

  const changeIntl = async (v: IntlVisibility) => {
    setIntl(v);
    const ok = await save({ intlVisibility: v }, t('me.privacy.saved'));
    if (!ok) setIntl(null);
  };

  const changeIncognito = (on: boolean) =>
    incognito.mutate(on, {
      onSuccess: () => useUi.getState().showToast({ message: on ? t('me.privacy.incognitoOn') : t('me.privacy.incognitoOff'), tone: 'success' }),
      onError: (e) => (isApiError(e, 'plan_required') ? router.push('/paywall') : toastError()),
    });

  const doPause = () => {
    let until: string | null = null;
    if (pauseChoice !== 'manual') {
      const end = new Date();
      end.setDate(end.getDate() + (pauseChoice === 'week' ? 7 : 30));
      until = end.toISOString();
    }
    pause.mutate(until, {
      onSuccess: () => useUi.getState().showToast({ message: t('me.privacy.pausedToast'), tone: 'success' }),
      onError: toastError,
    });
  };

  const doResume = () =>
    resume.mutate(undefined, {
      onSuccess: () => useUi.getState().showToast({ message: t('me.privacy.resumedToast'), tone: 'success' }),
      onError: toastError,
    });

  return (
    <Screen header={header} testID="privacy-screen">
      <View style={{ gap: spacing.xl }}>
        <Text variant="small" color={colors.textMuted}>
          {t('me.privacy.subtitle')}
        </Text>

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.privacy.photo')} style={{ marginBottom: 0 }} />
          {PHOTO_VISIBILITIES.map((v) => (
            <OptionCard
              key={v}
              icon={PHOTO_VISIBILITY_ICONS[v]}
              title={t(`common.photoVisibility.${v}`)}
              description={t(`common.photoVisibilityDesc.${v}`)}
              selected={photoValue === v}
              onPress={() => void changePhoto(v)}
            />
          ))}
        </View>

        <PhotoRequestsSection hideWhenEmpty />

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.privacy.intl')} style={{ marginBottom: 0 }} />
          <Text variant="caption" color={colors.textMuted}>
            {t('me.privacy.intlBody')}
          </Text>
          <Segmented<IntlVisibility>
            value={intlValue}
            onChange={(v) => void changeIntl(v)}
            options={INTL.map((v) => ({ value: v, label: t(`me.privacy.intlOptions.${v}`) }))}
          />
          <InlineNote text={t(`me.privacy.intlDesc.${intlValue}`)} />
        </View>

        <View style={{ gap: spacing.sm }} testID="privacy-incognito">
          <RowGroup title={t('me.privacy.profile')}>
            <ToggleRow
              icon="eye-off-outline"
              label={t('me.privacy.incognito')}
              description={s.canIncognito ? t('me.privacy.incognitoBody') : `${t('me.privacy.incognitoBody')} ${t('me.privacy.incognitoLocked')}`}
              value={s.canIncognito && s.incognito}
              onChange={changeIncognito}
              disabled={!s.canIncognito || incognito.isPending}
              locked={!s.canIncognito}
            />
            {!s.canIncognito ? <ListRow icon="sparkles-outline" iconColor={colors.premium} label={t('me.prefs.unlock')} onPress={() => router.push('/paywall')} /> : null}
          </RowGroup>
        </View>

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.privacy.pause')} style={{ marginBottom: 0 }} />
          <Card>
            <Text variant="small" color={colors.textMuted}>
              {t('me.privacy.pauseBody')}
            </Text>
            {s.paused ? (
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                <Tag
                  tone="amber"
                  icon="pause-circle-outline"
                  label={s.pausedUntil === null ? t('me.privacy.pausedManual') : t('me.privacy.pausedUntil', { date: formatDate(s.pausedUntil, locale) })}
                />
                <Button label={t('me.privacy.resume')} variant="primary" size="sm" loading={resume.isPending} onPress={doResume} style={{ alignSelf: 'flex-start' }} testID="privacy-resume" />
              </View>
            ) : (
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                <ChipRow>
                  {(['week', 'month', 'manual'] as PauseOption[]).map((o) => (
                    <Chip key={o} size="sm" label={t(`me.privacy.pauseOptions.${o}`)} selected={pauseChoice === o} onPress={() => setPauseChoice(o)} />
                  ))}
                </ChipRow>
                <Button
                  label={t('me.privacy.pause')}
                  variant="outline"
                  size="sm"
                  icon="pause-outline"
                  loading={pause.isPending}
                  onPress={doPause}
                  style={{ alignSelf: 'flex-start' }}
                  testID="privacy-pause-btn"
                />
              </View>
            )}
          </Card>
        </View>

        <ConsentsSection />

        {dataSection}
      </View>
      {sheets}
    </Screen>
  );
}
