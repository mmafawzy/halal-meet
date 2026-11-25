import type {
  GuardianDashboard,
  GuardianIntroduction,
  GuardianPendingApproval,
  GuardianSharedProfile,
  VerificationKind,
} from '@halal-meet/core';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Card, Divider, Icon, Tag, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { cityLabel } from '@/lib/cities';
import { colors, spacing } from '@/theme';

import { OPINION_TONE } from './shared';

const SHOWN_VERIFICATIONS: VerificationKind[] = ['identity', 'profession', 'family'];

/**
 * Renders a `GuardianDashboard` (spec 01 §45–46): introductions with stage, compatibility and
 * verifications, pending stage approvals (with Approve / Discuss actions on the guardian's screen),
 * profiles the member shared for an opinion, and the safety line. Used by the guardian's own screen and
 * by the member's "what my guardian sees" preview.
 */
export function DashboardView({
  dashboard,
  memberName,
  hiddenText,
  emptyText,
  approvalsNote,
  rowActions,
  rowExtra,
  approvalActions,
  sharedActions,
  sharedEmptyText,
  large,
}: {
  dashboard: GuardianDashboard;
  memberName: string;
  /** Shown when introductions are not shared (`introductions: null`). */
  hiddenText: string;
  emptyText: string;
  approvalsNote: string;
  rowActions?: (intro: GuardianIntroduction) => ReactNode;
  /** Extra line under a row (e.g. opinions in the member preview). */
  rowExtra?: (intro: GuardianIntroduction) => ReactNode;
  /** Approve / Discuss buttons on the guardian's own screen. */
  approvalActions?: (approval: GuardianPendingApproval) => ReactNode;
  /** Actions under a shared profile (the opinion button on the guardian's screen). */
  sharedActions?: (profile: GuardianSharedProfile) => ReactNode;
  /** When set, the "Shared with you" section shows even when empty, with this text. */
  sharedEmptyText?: string;
  /** Larger text for the guardian's own screen. */
  large?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const intros = dashboard.introductions;
  const nameVariant = large ? 'heading' : 'bodyStrong';
  const metaVariant = large ? 'body' : 'small';

  return (
    <View style={{ gap: spacing.lg }}>
      {intros === null ? (
        <View style={styles.locked} testID="dashboard-introductions-hidden">
          <Icon name="lock-closed-outline" size={22} color={colors.textSubtle} />
          <Text variant={metaVariant} color={colors.textMuted} center>
            {hiddenText}
          </Text>
        </View>
      ) : (
        <View style={{ gap: spacing.md }} testID="dashboard-introductions">
          <Text variant={large ? 'heading' : 'subheading'}>
            {intros.length === 1
              ? t('family.dashboard.activeIntroductionsOne', { name: memberName })
              : t('family.dashboard.activeIntroductions', { name: memberName, count: intros.length })}
          </Text>
          {intros.length === 0 ? (
            <Text variant={metaVariant} color={colors.textMuted}>
              {emptyText}
            </Text>
          ) : null}
          {intros.map((it, i) => (
            <View key={it.matchId} testID={`dashboard-intro-${it.otherId}`}>
              {i > 0 ? <Divider style={{ marginBottom: spacing.md }} /> : null}
              <View style={styles.introRow}>
                <Avatar id={it.otherId} name={it.otherFirstName} size={large ? 56 : 44} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant={nameVariant} numberOfLines={1}>
                    {it.otherFirstName}
                    {it.compatPct !== null ? (
                      <Text variant={metaVariant} color={colors.primary}>
                        {'  '}
                        {t('common.compatibleShort', { pct: it.compatPct })}
                      </Text>
                    ) : null}
                  </Text>
                  <Text variant={metaVariant} color={colors.textMuted} numberOfLines={1}>
                    {t('family.guardianSide.member.ageCity', { age: it.otherAge, city: cityLabel(it.otherCountry, it.otherCity, locale) })}
                  </Text>
                  <View style={styles.tags}>
                    <Tag
                      tone="primary"
                      icon="trail-sign-outline"
                      label={it.stage > 1 ? `${t('family.dashboard.stageLabel', { n: it.stage })} · ${t(`common.stage.${it.stage}`)}` : t('family.dashboard.matched')}
                    />
                    {it.verifications
                      .filter((v) => SHOWN_VERIFICATIONS.includes(v))
                      .map((v) => (
                        <Tag key={v} tone="neutral" icon="checkmark" label={t(`common.verificationShort.${v}`)} />
                      ))}
                    {it.opinion ? <Tag tone={OPINION_TONE[it.opinion.value]} label={t(`family.dashboard.opinions.${it.opinion.value}`)} /> : null}
                  </View>
                  {it.opinion?.note ? (
                    <Text variant={metaVariant} color={colors.textMuted} style={{ fontStyle: 'italic' }}>
                      “{it.opinion.note}”
                    </Text>
                  ) : null}
                  {rowExtra?.(it)}
                </View>
              </View>
              {rowActions ? <View style={[styles.actions, { marginTop: spacing.sm }]}>{rowActions(it)}</View> : null}
            </View>
          ))}
        </View>
      )}

      {dashboard.pendingApprovals && dashboard.pendingApprovals.length > 0 ? (
        <Card tone="discuss" style={{ gap: spacing.sm }}>
          <View testID="dashboard-approvals" style={{ gap: spacing.md }}>
            <Text variant="overline" color={colors.textMuted}>
              {t('family.dashboard.pendingApprovals')}
            </Text>
            <View style={styles.note}>
              <Icon name="time-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
              <Text variant={large ? 'small' : 'caption'} color={colors.textMuted} style={{ flex: 1 }}>
                {approvalsNote}
              </Text>
            </View>
            {dashboard.pendingApprovals.map((a, i) => (
              <View key={a.matchId} style={{ gap: spacing.xs }} testID={`dashboard-approval-${a.matchId}`}>
                {i > 0 ? <Divider style={{ marginBottom: spacing.sm }} /> : null}
                <Text variant={large ? 'subheading' : 'bodyStrong'}>
                  {t('family.dashboard.approvalRow', { name: a.otherFirstName, stage: t(`common.stage.${a.nextStage}`) })}
                </Text>
                <View style={styles.inline}>
                  <Icon
                    name={a.memberReady ? 'checkmark-circle' : 'ellipse-outline'}
                    size={16}
                    color={a.memberReady ? colors.primary : colors.textSubtle}
                  />
                  <Text variant={large ? 'small' : 'caption'} color={colors.textMuted} style={{ flex: 1 }} testID={`dashboard-approval-ready-${a.matchId}`}>
                    {a.memberReady ? t('family.dashboard.memberReady', { name: memberName }) : t('family.dashboard.memberNotReady')}
                  </Text>
                </View>
                {a.decision === 'discuss' ? (
                  <Tag tone="amber" icon="chatbubbles-outline" label={t('family.dashboard.discussChosen')} style={{ alignSelf: 'flex-start' }} />
                ) : null}
                {approvalActions ? <View style={[styles.actions, { marginTop: spacing.xs }]}>{approvalActions(a)}</View> : null}
              </View>
            ))}
          </View>
        </Card>
      ) : null}

      {dashboard.sharedProfiles && (dashboard.sharedProfiles.length > 0 || sharedEmptyText) ? (
        <View style={{ gap: spacing.md }} testID="dashboard-shared">
          <View style={{ gap: 2 }}>
            <Text variant={large ? 'heading' : 'subheading'}>{t('family.dashboard.sharedTitle')}</Text>
            <Text variant={metaVariant} color={colors.textMuted}>
              {dashboard.sharedProfiles.length > 0 ? t('family.dashboard.sharedBody', { name: memberName }) : sharedEmptyText}
            </Text>
          </View>
          {dashboard.sharedProfiles.map((p, i) => (
            <View key={p.subjectId} testID={`dashboard-shared-${p.subjectId}`}>
              {i > 0 ? <Divider style={{ marginBottom: spacing.md }} /> : null}
              <View style={styles.introRow}>
                <Avatar id={p.subjectId} name={p.firstName} size={large ? 56 : 44} />
                <View style={{ flex: 1, gap: 4 }}>
                  <Text variant={nameVariant} numberOfLines={1}>
                    {p.firstName}
                    {p.compatPct !== null ? (
                      <Text variant={metaVariant} color={colors.primary}>
                        {'  '}
                        {t('common.compatibleShort', { pct: p.compatPct })}
                      </Text>
                    ) : null}
                  </Text>
                  <Text variant={metaVariant} color={colors.textMuted} numberOfLines={1}>
                    {t('family.guardianSide.member.ageCity', { age: p.age, city: cityLabel(p.country, p.city, locale) })}
                  </Text>
                  <View style={styles.tags}>
                    {p.verifications
                      .filter((v) => SHOWN_VERIFICATIONS.includes(v))
                      .map((v) => (
                        <Tag key={v} tone="neutral" icon="checkmark" label={t(`common.verificationShort.${v}`)} />
                      ))}
                    {p.opinion ? <Tag tone={OPINION_TONE[p.opinion.value]} label={t(`family.dashboard.opinions.${p.opinion.value}`)} /> : null}
                  </View>
                  {p.opinion?.note ? (
                    <Text variant={metaVariant} color={colors.textMuted} style={{ fontStyle: 'italic' }}>
                      “{p.opinion.note}”
                    </Text>
                  ) : null}
                </View>
              </View>
              {sharedActions ? <View style={[styles.actions, { marginTop: spacing.sm }]}>{sharedActions(p)}</View> : null}
            </View>
          ))}
        </View>
      ) : null}

      {dashboard.safety ? (
        <View style={styles.safety} testID={dashboard.safety.allClear ? 'dashboard-safety-clear' : 'dashboard-safety-open'}>
          <Icon
            name={dashboard.safety.allClear ? 'shield-checkmark' : 'shield-half-outline'}
            size={22}
            color={dashboard.safety.allClear ? colors.primary : colors.danger}
          />
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant={large ? 'subheading' : 'bodyStrong'}>
              {dashboard.safety.allClear
                ? t('family.dashboard.safetyAllClear')
                : dashboard.safety.openReports === 1
                  ? t('family.dashboard.safetyOpenOne')
                  : t('family.dashboard.safetyOpen', { count: dashboard.safety.openReports })}
            </Text>
            <Text variant={large ? 'small' : 'caption'} color={colors.textMuted}>
              {dashboard.safety.allClear ? t('family.dashboard.safetyAllClearBody') : t('family.dashboard.safetyOpenBody')}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  locked: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  introRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  inline: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  safety: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
});
