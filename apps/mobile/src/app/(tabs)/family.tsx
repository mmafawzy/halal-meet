import type { GuardianInviteResponse } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { api } from '@/api';
import { useGuardianLinks, useGuardianOpinions, useGuardians, useMatches, useReissueGuardianInvite } from '@/api/hooks';
import { DashboardPreview } from '@/components/family/DashboardPreview';
import { GuardianCard } from '@/components/family/GuardianCard';
import { PermissionsSheet, RemoveGuardianSheet } from '@/components/family/GuardianSheets';
import { BackendCard, DisclosureCard, IntroCard, PressureCard, WaliInviteCard } from '@/components/family/InfoCards';
import { InviteSheet } from '@/components/family/InviteSheet';
import { OpinionsSection } from '@/components/family/OpinionsSection';
import { useMyFamilyContext, GUARDIAN_HOME } from '@/components/family/shared';
import { Button, Card, EmptyState, ErrorState, LoadingState, PreviewBadge, Screen, SectionTitle, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

/**
 * Family tab (spec 01 §43–49, README §5): guardian intro and disclosure, the user's guardians with full
 * control (permissions, pause/resume, remove), the invite flow + share sheet with the real one-time link,
 * guardians' opinions on the user's introductions, and a preview of what a guardian sees.
 * Data: GUARDIAN_ROUTES via src/api (mock backend or live HTTP).
 */
export default function FamilyScreen() {
  const t = useT();
  const { mode, firstName, gender } = useMyFamilyContext();
  const guardiansQ = useGuardians();
  const opinionsQ = useGuardianOpinions();
  const linksQ = useGuardianLinks();
  const matches = useMatches();
  const reissue = useReissueGuardianInvite();
  const showToast = useUi((s) => s.showToast);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [share, setShare] = useState<GuardianInviteResponse | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [removeId, setRemoveId] = useState<string | null>(null);

  const guardians = guardiansQ.data ?? [];
  const opinions = opinionsQ.data ?? [];
  const mock = !!api.dev;
  const wali = mode === 'wali';
  const hasGuardians = guardians.length > 0;
  const editing = guardians.find((g) => g.id === editId) ?? null;
  const removing = guardians.find((g) => g.id === removeId) ?? null;

  const openInvite = () => {
    setShare(null);
    setInviteOpen(true);
  };

  /** "Send the invitation again": POST /guardians/:id/invite issues a new code, then the share step opens. */
  const sendAgain = (id: string) => {
    reissue.mutate(id, {
      onSuccess: (res) => {
        setShare(res);
        setInviteOpen(true);
        showToast({ message: t('family.guardians.reissued'), tone: 'success', durationMs: 2500 });
      },
      onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
    });
  };

  return (
    <Screen edges={['top']} pattern testID="family-screen">
      <View style={{ gap: spacing.xs, marginBottom: spacing.lg, marginTop: spacing.sm }}>
        <Text variant="title">{t('family.title')}</Text>
        <Text variant="small" color={colors.textMuted}>
          {t('family.subtitle')}
        </Text>
        {mock ? <PreviewBadge label={t('family.previewLabel')} /> : null}
      </View>

      <View style={{ gap: spacing.xl }}>
        {wali && guardiansQ.isSuccess && !hasGuardians ? <WaliInviteCard onInvite={openInvite} /> : null}

        {!hasGuardians ? <IntroCard /> : null}

        <View>
          <SectionTitle
            title={
              hasGuardians
                ? guardians.length === 1
                  ? t('family.guardians.countOne')
                  : t('family.guardians.count', { n: guardians.length })
                : t('family.guardians.title')
            }
          />
          {guardiansQ.isLoading ? (
            <LoadingState />
          ) : guardiansQ.isError ? (
            <Card padded={false}>
              <ErrorState onRetry={() => void guardiansQ.refetch()} />
            </Card>
          ) : hasGuardians ? (
            <View style={{ gap: spacing.md }}>
              {guardians.map((g) => (
                <GuardianCard
                  key={g.id}
                  guardian={g}
                  onEdit={() => setEditId(g.id)}
                  onRemove={() => setRemoveId(g.id)}
                  onShareAgain={() => sendAgain(g.id)}
                  sharing={reissue.isPending && reissue.variables === g.id}
                />
              ))}
              <Button
                label={t('family.actions.addAnother')}
                icon="person-add-outline"
                variant="outline"
                fullWidth
                onPress={openInvite}
                testID="family-invite-another"
              />
            </View>
          ) : (
            <Card padded={false}>
              <EmptyState
                icon="people-outline"
                title={t('family.guardians.empty')}
                body={t('family.guardians.emptyBody')}
                action={
                  <Button
                    label={t('family.guardians.emptyAction')}
                    icon="person-add-outline"
                    variant={wali ? 'outline' : 'primary'}
                    onPress={openInvite}
                    testID="family-invite"
                  />
                }
              />
            </Card>
          )}
        </View>

        {hasGuardians ? <OpinionsSection opinions={opinions} matches={matches.data ?? []} /> : null}

        <DisclosureCard />

        {hasGuardians ? <IntroCard /> : null}

        <DashboardPreview guardians={guardians} opinions={opinions} mode={mode} firstName={firstName} gender={gender} />

        <PressureCard />

        {(linksQ.data?.length ?? 0) > 0 ? (
          <Card tone="primary">
            <View style={{ gap: spacing.sm }} testID="family-guardian-for">
              <Text variant="subheading">{t('family.backend.guardianFor')}</Text>
              <Button
                label={t('family.backend.openGuardianArea')}
                icon="people-circle-outline"
                variant="secondary"
                size="sm"
                style={{ alignSelf: 'flex-start' }}
                onPress={() => router.push(GUARDIAN_HOME)}
                testID="family-open-guardian-area"
              />
            </View>
          </Card>
        ) : null}

        <BackendCard
          mock={mock}
          onTryGuardianSide={
            api.dev ? () => router.push({ pathname: '/guardian/[code]', params: { code: api.dev!.demoGuardianInviteCode } }) : undefined
          }
        />
      </View>

      <InviteSheet visible={inviteOpen} onClose={() => setInviteOpen(false)} mode={mode} share={share} />
      <PermissionsSheet guardian={editing} onClose={() => setEditId(null)} />
      <RemoveGuardianSheet guardian={removing} onClose={() => setRemoveId(null)} />
    </Screen>
  );
}
