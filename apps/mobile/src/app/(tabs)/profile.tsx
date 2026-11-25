import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useMe } from '@/api/hooks';
import { useAccountActions } from '@/components/me/accountActions';
import { ConfirmSheet } from '@/components/me/ConfirmSheet';
import { DemoTools, LanguageCard, PlanCard, PreferencesSummary, ProfileSummaryCard, VerificationCard } from '@/components/me/MeSections';
import { Button, EmptyState, ErrorState, ListRow, LoadingState, RowGroup, Screen, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

/**
 * Screen 56 (+57, 61) — the "Me" tab: profile summary and strength, verification, plan and usage,
 * Passport, preferences summary, links to the settings screens, language, demo tools and sign out.
 */
export default function ProfileTab() {
  const t = useT();
  const me = useMe();
  const { signOut } = useAccountActions();
  const [confirmSignOut, setConfirmSignOut] = useState(false);

  const body = () => {
    if (me.isLoading) return <LoadingState />;
    if (me.isError || !me.data) return <ErrorState onRetry={() => void me.refetch()} />;
    const data = me.data;
    if (!data.profile) {
      return (
        <EmptyState
          icon="person-outline"
          title={t('me.empty.title')}
          body={t('me.empty.body')}
          action={<Button label={t('me.empty.cta')} onPress={() => router.replace('/')} />}
        />
      );
    }
    return (
      <View style={{ gap: spacing.xl }}>
        <ProfileSummaryCard me={data} />

        <RowGroup title={t('me.title')}>
          <ListRow
            icon="create-outline"
            label={t('me.menu.editProfile')}
            description={t('me.menu.editProfileBody')}
            onPress={() => router.push('/settings/edit')}
          />
          <ListRow
            icon="options-outline"
            label={t('me.menu.preferences')}
            description={t('me.menu.preferencesBody')}
            onPress={() => router.push('/settings/preferences')}
          />
          <ListRow
            icon="help-buoy-outline"
            label={t('me.menu.questions')}
            description={t('me.menu.questionsBody', { count: data.answersCount })}
            onPress={() => router.push('/settings/questions')}
          />
        </RowGroup>

        <PlanCard me={data} />
        <VerificationCard me={data} />
        <PreferencesSummary />

        <RowGroup title={t('me.settings.title')}>
          <ListRow
            icon="lock-closed-outline"
            label={t('me.links.privacy')}
            description={t('me.links.privacyBody')}
            onPress={() => router.push('/settings/privacy')}
          />
          <ListRow
            icon="shield-outline"
            label={t('me.links.safety')}
            description={t('me.links.safetyBody')}
            onPress={() => router.push('/settings/safety')}
          />
        </RowGroup>

        <LanguageCard />
        <DemoTools me={data} />

        <RowGroup title={t('me.settings.account')}>
          <ListRow icon="log-out-outline" danger label={t('me.signOut.title')} description={t('me.signOut.body')} onPress={() => setConfirmSignOut(true)} />
        </RowGroup>
      </View>
    );
  };

  return (
    <Screen edges={['top']} pattern testID="me-screen">
      <View style={{ gap: 2, marginBottom: spacing.lg, marginTop: spacing.sm }}>
        <Text variant="title">{t('me.title')}</Text>
        <Text variant="small" color={colors.textMuted}>
          {t('me.subtitle')}
        </Text>
      </View>
      {body()}
      <ConfirmSheet
        visible={confirmSignOut}
        onClose={() => setConfirmSignOut(false)}
        title={t('me.signOut.confirmTitle')}
        body={t('me.signOut.confirmBody')}
        confirmLabel={t('me.signOut.confirm')}
        danger
        testID="me-signout-sheet"
        onConfirm={() => {
          setConfirmSignOut(false);
          void signOut();
        }}
      />
    </Screen>
  );
}
