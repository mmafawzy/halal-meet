import type { GuardianOpinionValue, GuardianPendingApproval } from '@halal-meet/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';

import {
  useGuardianDashboard,
  useGuardianLinks,
  useLeaveGuardianship,
  usePutGuardianApproval,
  usePutGuardianOpinion,
} from '@/api/hooks';
import { DashboardView } from '@/components/family/DashboardView';
import { OpinionSheet } from '@/components/family/OpinionSheet';
import { apiError, GUARDIAN_HOME } from '@/components/family/shared';
import { Button, Card, ErrorState, Header, Icon, LoadingState, Screen, Sheet, Tag, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

/** Someone the guardian can give an opinion on: an introduction or a profile the member shared. */
interface OpinionSubject {
  id: string;
  name: string;
  opinion: { value: GuardianOpinionValue; note: string | null } | null;
}

/**
 * Guardian dashboard for one member (GET /guardian/members/:memberId): introductions with stage,
 * compatibility and verifications, the guardian's private opinion on each (PUT …/opinions/:subjectId),
 * stage approvals (PUT …/approvals/:matchId: Approve or "Discuss with <name> first"), profiles the member
 * shared for an opinion, the safety line, and "Leave guardianship".
 */
export default function GuardianMemberScreen() {
  const t = useT();
  const { memberId } = useLocalSearchParams<{ memberId: string }>();
  const dash = useGuardianDashboard(memberId);
  const links = useGuardianLinks();
  const putOpinion = usePutGuardianOpinion(memberId ?? '');
  const putApproval = usePutGuardianApproval(memberId ?? '');
  const leave = useLeaveGuardianship();
  const showToast = useUi((s) => s.showToast);
  const [opinionFor, setOpinionFor] = useState<OpinionSubject | null>(null);
  const [leaveOpen, setLeaveOpen] = useState(false);

  const link = links.data?.find((l) => l.memberId === memberId) ?? null;
  const name = dash.data?.member.firstName ?? link?.memberFirstName ?? '';
  const err = apiError(dash.error);

  const goHome = () => (router.canGoBack() ? router.back() : router.replace(GUARDIAN_HOME));

  const header = <Header onBack={goHome} title={name ? t('family.guardianSide.member.title', { name }) : undefined} />;

  const confirmLeave = () => {
    if (!memberId) return;
    leave.mutate(memberId, {
      onSuccess: () => {
        setLeaveOpen(false);
        showToast({ message: t('family.guardianSide.member.left', { name }) });
        router.replace(GUARDIAN_HOME);
      },
      onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
    });
  };

  const decide = (a: GuardianPendingApproval, decision: 'approve' | 'discuss') => {
    putApproval.mutate(
      { matchId: a.matchId, body: { stage: a.nextStage as 5 | 6, decision } },
      {
        onSuccess: () =>
          showToast({
            message: decision === 'approve' ? t('family.dashboard.approved', { name }) : t('family.dashboard.discussSent', { name }),
            tone: 'success',
            durationMs: 3000,
          }),
        onError: () => {
          showToast({ message: t('common.states.error'), tone: 'danger' });
          void dash.refetch();
        },
      },
    );
  };
  const deciding = (a: GuardianPendingApproval, decision: 'approve' | 'discuss') =>
    putApproval.isPending && putApproval.variables?.matchId === a.matchId && putApproval.variables.body.decision === decision;

  let body: ReactNode;
  if (dash.isLoading) {
    body = <LoadingState />;
  } else if (err?.code === 'guardian_paused') {
    body = (
      <Card>
        <View style={{ gap: spacing.md, alignItems: 'center' }} testID="guardian-member-paused">
          <Icon name="pause-circle-outline" size={40} color={colors.textMuted} />
          <Text variant="heading" center>
            {t('family.guardianSide.member.pausedTitle')}
          </Text>
          <Text variant="body" color={colors.textMuted} center>
            {t('family.guardianSide.member.pausedBody', { name })}
          </Text>
        </View>
      </Card>
    );
  } else if (err?.status === 404 || err?.status === 403) {
    body = (
      <Card>
        <View style={{ gap: spacing.md, alignItems: 'center' }} testID="guardian-member-ended">
          <Icon name="people-outline" size={40} color={colors.textMuted} />
          <Text variant="body" color={colors.textMuted} center>
            {t('family.guardianSide.member.notFound')}
          </Text>
          <Button label={t('family.guardianSide.member.back')} variant="outline" onPress={() => router.replace(GUARDIAN_HOME)} />
        </View>
      </Card>
    );
  } else if (dash.isError || !dash.data) {
    body = <ErrorState onRetry={() => void dash.refetch()} />;
  } else {
    const d = dash.data;
    body = (
      <View style={{ gap: spacing.xl }}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="body" color={colors.textMuted}>
            {t('family.guardianSide.member.intro', { name })}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
            <Tag tone="neutral" icon="people-outline" label={t(`family.invite.relationships.${d.relationship}`)} />
            <Tag tone="neutral" icon="leaf-outline" label={t(`common.halalModeShort.${d.member.halalMode}`)} />
          </View>
        </View>

        <Card>
          <DashboardView
            dashboard={d}
            memberName={name}
            large
            hiddenText={t('family.guardianSide.member.introductionsHidden', { name })}
            emptyText={t('family.guardianSide.member.noIntroductions')}
            approvalsNote={t('family.guardianSide.member.approvalsIntro', { name })}
            rowActions={(it) => (
              <Button
                label={it.opinion ? t('family.guardianSide.member.changeOpinion') : t('family.dashboard.opinion')}
                icon="chatbox-ellipses-outline"
                variant={it.opinion ? 'outline' : 'secondary'}
                onPress={() => setOpinionFor({ id: it.otherId, name: it.otherFirstName, opinion: it.opinion })}
                testID={`guardian-opinion-open-${it.otherId}`}
              />
            )}
            approvalActions={(a) => (
              <>
                <Button
                  label={t('family.dashboard.approve')}
                  icon="checkmark-circle-outline"
                  loading={deciding(a, 'approve')}
                  disabled={putApproval.isPending}
                  onPress={() => decide(a, 'approve')}
                  testID={`guardian-approve-${a.matchId}`}
                />
                {a.decision !== 'discuss' ? (
                  <Button
                    label={t('family.dashboard.discussFirst', { name })}
                    icon="chatbubbles-outline"
                    variant="outline"
                    loading={deciding(a, 'discuss')}
                    disabled={putApproval.isPending}
                    onPress={() => decide(a, 'discuss')}
                    testID={`guardian-discuss-${a.matchId}`}
                  />
                ) : null}
              </>
            )}
            sharedEmptyText={t('family.dashboard.sharedEmpty')}
            sharedActions={(p) => (
              <Button
                label={p.opinion ? t('family.guardianSide.member.changeOpinion') : t('family.dashboard.opinion')}
                icon="chatbox-ellipses-outline"
                variant={p.opinion ? 'outline' : 'secondary'}
                onPress={() => setOpinionFor({ id: p.subjectId, name: p.firstName, opinion: p.opinion })}
                testID={`guardian-opinion-open-${p.subjectId}`}
              />
            )}
          />
        </Card>

        <Text variant="small" color={colors.textSubtle}>
          {t('family.disclosure.short')}
        </Text>

        <Button
          label={t('family.guardianSide.member.leave')}
          icon="exit-outline"
          variant="ghost"
          onPress={() => setLeaveOpen(true)}
          style={{ alignSelf: 'flex-start' }}
          testID="guardian-member-leave"
        />
      </View>
    );
  }

  return (
    <Screen header={header} pattern testID="guardian-member-screen">
      {body}

      <OpinionSheet
        subject={opinionFor ? { id: opinionFor.id, name: opinionFor.name } : null}
        memberName={name}
        initial={opinionFor?.opinion ?? null}
        loading={putOpinion.isPending}
        onClose={() => setOpinionFor(null)}
        onSubmit={(value, note) => {
          if (!opinionFor) return;
          putOpinion.mutate(
            { subjectId: opinionFor.id, body: { opinion: value, note } },
            {
              onSuccess: () => {
                setOpinionFor(null);
                showToast({ message: t('family.dashboard.opinionSent', { name }), tone: 'success' });
              },
              onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
            },
          );
        }}
      />

      <Sheet
        visible={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        title={t('family.guardianSide.member.leaveConfirm', { name })}
        testID="guardian-leave-sheet"
        footer={
          <>
            <Button
              label={t('family.guardianSide.member.leave')}
              variant="danger"
              icon="exit-outline"
              fullWidth
              loading={leave.isPending}
              onPress={confirmLeave}
              testID="guardian-leave-confirm"
            />
            <Button label={t('common.actions.cancel')} variant="ghost" fullWidth onPress={() => setLeaveOpen(false)} />
          </>
        }
      >
        <Text variant="body" color={colors.textMuted}>
          {t('family.guardianSide.member.leaveBody', { name })}
        </Text>
      </Sheet>
    </Screen>
  );
}
