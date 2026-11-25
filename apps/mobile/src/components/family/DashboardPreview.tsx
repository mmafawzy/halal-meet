import {
  defaultGuardianPermissions,
  type Gender,
  type Guardian,
  type GuardianOpinion,
  type HalalMode,
  type JourneyStage,
  type VerificationKind,
} from '@halal-meet/core';
import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { guardianKeys, useMatches } from '@/api/hooks';
import { Button, Icon, PreviewBadge, Text } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { buildGuardianDashboard, dashboardInputFromSummary, type DashboardMatchInput } from '@/lib/guardianDashboard';
import { colors, radii, spacing } from '@/theme';

import { DashboardView } from './DashboardView';
import { guardianGender } from './shared';

/**
 * The member's preview of the guardian dashboard (spec 01 §45–46): exactly what one guardian sees with
 * their current permissions, built from the member's real matches with the same rules as
 * GET /guardian/members/:memberId (src/lib/guardianDashboard.ts). Falls back to example rows when there
 * are no active matches. Only the member sees this preview.
 * In mock mode, once that guardian has accepted, the preview is the mock backend's own dashboard for them
 * (`api.dev.guardianDashboardFor`), so profiles you shared and pending stage approvals show up too. The live
 * contract has no GET for shares, so the live preview never lists shared profiles.
 */
export function DashboardPreview({
  guardians,
  opinions,
  mode,
  firstName,
  gender,
}: {
  guardians: Guardian[];
  opinions: GuardianOpinion[];
  mode: HalalMode;
  firstName: string;
  gender: Gender;
}) {
  const t = useT();
  const ts = useTs();
  const matches = useMatches();

  // Whose eyes: the first active guardian, else the first one not paused, else the Halal Mode defaults.
  const viewer = guardians.find((g) => g.status === 'active') ?? guardians.find((g) => g.status !== 'paused') ?? null;
  const perms = viewer?.permissions ?? defaultGuardianPermissions(mode);
  const userName = firstName || '…';

  const active = useMemo(() => (matches.data ?? []).filter((m) => m.status === 'active'), [matches.data]);
  const backendPreview = useQuery({
    queryKey: guardianKeys.previewFor(viewer?.id ?? ''),
    queryFn: () => api.dev!.guardianDashboardFor(viewer!.id),
    enabled: !!api.dev && !!viewer && viewer.accepted && viewer.status === 'active',
    retry: false,
  });
  const fromBackend = backendPreview.data ?? null;
  const real = active.length > 0 || (fromBackend?.sharedProfiles?.length ?? 0) > 0;

  const dashboard = useMemo(() => {
    if (fromBackend && real) return fromBackend;
    let input: DashboardMatchInput[];
    if (real) {
      input = active.map(dashboardInputFromSummary);
    } else {
      // Example rows use names of the gender the user is looking for.
      const g = gender === 'female' ? 'male' : 'female';
      const ex = (n: 1 | 2 | 3, stage: JourneyStage, pct: number, v: VerificationKind[]): DashboardMatchInput => ({
        matchId: `ex${n}`,
        otherId: `ex${n}`,
        otherFirstName: t(`family.dashboard.examples.${g}${n}`),
        otherAge: 26 + n,
        otherCity: 'Cairo',
        otherCountry: 'EG',
        verifications: v,
        stage,
        status: 'active',
        compatPct: pct,
      });
      input = [ex(1, 4, 87, ['identity', 'profession']), ex(2, 2, 84, ['identity']), ex(3, 1, 79, [])];
    }
    const mine = viewer ? opinions.filter((o) => o.guardianId === viewer.id) : [];
    return buildGuardianDashboard({
      member: { id: 'me', firstName: userName, halalMode: mode },
      relationship: viewer?.relationship ?? 'other',
      permissions: perms,
      matches: input,
      opinions: real ? Object.fromEntries(mine.map((o) => [o.subjectId, { value: o.opinion, note: o.note }])) : {},
      openReports: 0,
    });
  }, [fromBackend, real, active, gender, t, viewer, opinions, userName, mode, perms]);

  return (
    <View testID="family-dashboard" style={{ gap: spacing.md }}>
      <View style={styles.titleRow}>
        <Text variant="heading" style={{ flex: 1 }}>
          {t('family.dashboard.heading')}
        </Text>
        <PreviewBadge />
      </View>
      <Text variant="small" color={colors.textMuted}>
        {real ? t('family.dashboard.realNote') : t('family.dashboard.previewNote')}{' '}
        {viewer ? ts('family.dashboard.basedOn', guardianGender(viewer.relationship), { name: viewer.name }) : t('family.dashboard.basedOnDefaults')}
      </Text>

      {/* The framed "guardian's screen". */}
      <View style={styles.frame}>
        <DashboardView
          dashboard={dashboard}
          memberName={userName}
          hiddenText={t('family.dashboard.noAccess')}
          emptyText={t('family.guardianSide.member.noIntroductions')}
          approvalsNote={
            viewer ? ts('family.dashboard.approvalsPreview', guardianGender(viewer.relationship)) : t('family.dashboard.approvalsPreview')
          }
          rowActions={
            real
              ? (it) => (
                  <Button
                    label={t('family.dashboard.view')}
                    variant="outline"
                    size="sm"
                    onPress={() => router.push({ pathname: '/profile/[id]', params: { id: it.otherId } })}
                    testID={`family-dashboard-view-${it.matchId}`}
                  />
                )
              : undefined
          }
          sharedActions={(p) => (
            <Button
              label={t('family.dashboard.view')}
              variant="outline"
              size="sm"
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: p.subjectId } })}
              testID={`family-dashboard-shared-view-${p.subjectId}`}
            />
          )}
        />

        <View style={styles.digest}>
          <Icon name="calendar-outline" size={20} color={colors.textMuted} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="bodyStrong">{t('family.dashboard.digest')}</Text>
            <Text variant="caption" color={colors.textMuted}>
              {t('family.dashboard.digestBody')}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  frame: {
    gap: spacing.lg,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  digest: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
