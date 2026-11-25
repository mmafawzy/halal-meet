import type { IntlVisibility, PhotoVisibility } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { isPaused, useMeLocal } from '@/components/me/meStore';
import { useSaveProfile } from '@/components/me/useSaveProfile';
import { PHOTO_VISIBILITIES, PHOTO_VISIBILITY_ICONS } from '@/components/onboarding/draft';
import { InlineNote } from '@/components/onboarding/OnboardingFrame';
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
type Soon = 'export' | 'conversations' | 'delete';

/** Privacy center (screen 58). Never paywalled, except Incognito (Plus). */
export default function PrivacyScreen() {
  const t = useT();
  const locale = useLocale();
  const { me, profile, save } = useSaveProfile();
  const incognito = useMeLocal((s) => s.incognito);
  const setIncognito = useMeLocal((s) => s.setIncognito);
  const pausedUntil = useMeLocal((s) => s.pausedUntil);
  const pause = useMeLocal((s) => s.pause);
  const resume = useMeLocal((s) => s.resume);

  const [photo, setPhoto] = useState<PhotoVisibility | null>(null);
  const [intl, setIntl] = useState<IntlVisibility | null>(null);
  const [pauseChoice, setPauseChoice] = useState<PauseOption>('week');
  const [soon, setSoon] = useState<Soon | null>(null);

  const header = <Header title={t('me.privacy.title')} />;
  if (me.isLoading) return <Screen header={header}><LoadingState /></Screen>;
  if (me.isError) return <Screen header={header}><ErrorState onRetry={() => void me.refetch()} /></Screen>;
  if (!profile || !me.data) {
    return (
      <Screen header={header}>
        <EmptyState icon="person-outline" title={t('me.empty.title')} body={t('me.empty.body')} action={<Button label={t('me.empty.cta')} onPress={() => router.replace('/')} />} />
      </Screen>
    );
  }

  const canIncognito = me.data.entitlements.limits.incognito;
  const photoValue = photo ?? profile.photoVisibility;
  const intlValue = intl ?? profile.intlVisibility ?? 'on';
  const paused = isPaused(pausedUntil);

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

  const doPause = () => {
    const now = new Date();
    if (pauseChoice === 'manual') pause('manual');
    else {
      now.setDate(now.getDate() + (pauseChoice === 'week' ? 7 : 30));
      pause(now.toISOString());
    }
    useUi.getState().showToast({ message: t('me.privacy.pausedToast'), tone: 'success' });
  };

  const doResume = () => {
    resume();
    useUi.getState().showToast({ message: t('me.privacy.resumedToast'), tone: 'success' });
  };

  const soonBody = soon === 'export' ? t('me.privacy.exportSoon') : soon === 'delete' ? t('me.privacy.deleteSoon') : t('me.privacy.conversationsSoon');

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

        <View style={{ gap: spacing.sm }}>
          <RowGroup title={t('me.privacy.profile')}>
            <ToggleRow
              icon="eye-off-outline"
              label={t('me.privacy.incognito')}
              description={canIncognito ? t('me.privacy.incognitoBody') : `${t('me.privacy.incognitoBody')} ${t('me.privacy.incognitoLocked')}`}
              value={canIncognito && incognito}
              onChange={setIncognito}
              disabled={!canIncognito}
              locked={!canIncognito}
            />
            {!canIncognito ? <ListRow icon="sparkles-outline" iconColor={colors.premium} label={t('me.prefs.unlock')} onPress={() => router.push('/paywall')} /> : null}
          </RowGroup>
          <InlineNote text={t('me.privacy.deviceOnly')} />
        </View>

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.privacy.pause')} style={{ marginBottom: 0 }} />
          <Card>
            <Text variant="small" color={colors.textMuted}>
              {t('me.privacy.pauseBody')}
            </Text>
            {paused ? (
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                <Tag
                  tone="amber"
                  icon="pause-circle-outline"
                  label={pausedUntil === 'manual' ? t('me.privacy.pausedManual') : t('me.privacy.pausedUntil', { date: formatDate(pausedUntil, locale) })}
                />
                <Button label={t('me.privacy.resume')} variant="primary" size="sm" onPress={doResume} style={{ alignSelf: 'flex-start' }} testID="privacy-resume" />
              </View>
            ) : (
              <View style={{ gap: spacing.md, marginTop: spacing.md }}>
                <ChipRow>
                  {(['week', 'month', 'manual'] as PauseOption[]).map((o) => (
                    <Chip key={o} size="sm" label={t(`me.privacy.pauseOptions.${o}`)} selected={pauseChoice === o} onPress={() => setPauseChoice(o)} />
                  ))}
                </ChipRow>
                <Button label={t('me.privacy.pause')} variant="outline" size="sm" icon="pause-outline" onPress={doPause} style={{ alignSelf: 'flex-start' }} testID="privacy-pause-btn" />
              </View>
            )}
          </Card>
          <InlineNote text={t('me.privacy.deviceOnly')} />
        </View>

        <RowGroup title={t('me.privacy.data')}>
          <ListRow icon="download-outline" label={t('me.privacy.export')} description={t('me.privacy.exportBody')} right={<Tag label={t('me.privacy.comingSoon')} />} onPress={() => setSoon('export')} />
          <ListRow icon="chatbubbles-outline" label={t('me.privacy.deleteConversations')} right={<Tag label={t('me.privacy.comingSoon')} />} onPress={() => setSoon('conversations')} />
          <ListRow icon="trash-outline" danger label={t('me.privacy.deleteAccount')} description={t('me.privacy.deleteAccountBody')} right={<Tag label={t('me.privacy.comingSoon')} />} onPress={() => setSoon('delete')} />
        </RowGroup>
      </View>

      <Sheet
        visible={soon !== null}
        onClose={() => setSoon(null)}
        title={t('me.privacy.comingSoonTitle')}
        footer={<Button label={t('common.actions.gotIt')} fullWidth onPress={() => setSoon(null)} />}
      >
        <Text variant="body" color={colors.textMuted}>
          {soonBody}
        </Text>
      </Sheet>
    </Screen>
  );
}
