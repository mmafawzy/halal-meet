import type { AdminEvidenceMessage, AdminReportDetail, AdminReportListItem, ResolveAction } from '@halal-meet/core';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, ErrorState, LoadingState, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

import {
  ActionHistory,
  ActionSheet,
  personName,
  PersonLine,
  PriorityPill,
  ReportStatusPill,
  RiskPills,
  Section,
  useAgo,
  useFormatDate,
} from './parts';
import { adminErrorKey, useAdminReport, useResolveReport } from './useAdmin';

// ───────── Queue row ─────────

export function ReportRow({ item, selected, onPress }: { item: AdminReportListItem; selected?: boolean; onPress: () => void }) {
  const t = useT();
  const ago = useAgo();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={`admin-report-${item.id}`}
      style={({ pressed }) => [styles.row, selected && styles.rowSelected, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.rowHead}>
        <PriorityPill priority={item.priority} />
        <Text variant="bodyStrong" style={styles.fill} numberOfLines={1}>
          {t(`admin.category.${item.category}`)} · {personName(item.subject, t('admin.queue.unknown'))}
        </Text>
        <Text variant="caption" color={colors.textSubtle}>
          {ago(item.status === 'open' ? item.createdAt : item.resolvedAt)}
        </Text>
      </View>
      {item.details ? (
        <Text variant="small" color={colors.textMuted} numberOfLines={2}>
          {item.details}
        </Text>
      ) : null}
      <View style={styles.wrapRow}>
        {item.status !== 'open' ? <ReportStatusPill status={item.status} /> : null}
        <RiskPills flags={item.riskFlags} />
        <Text variant="caption" color={colors.textSubtle}>
          {t('admin.queue.reportedBy', { name: personName(item.reporter, t('admin.queue.unknown')) })}
          {item.evidenceCount ? ` · ${t('admin.queue.evidence', { n: item.evidenceCount })}` : ''}
          {item.priorReportCount ? ` · ${t('admin.queue.prior', { n: item.priorReportCount })}` : ''}
          {item.priorActionCount ? ` · ${t('admin.queue.priorActions', { n: item.priorActionCount })}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

// ───────── Detail ─────────

type Pending = { action: ResolveAction; messageId?: string } | null;

export function ReportDetailView({ id }: { id: string }) {
  const t = useT();
  const q = useAdminReport(id);
  if (q.isLoading) return <LoadingState />;
  if (q.isError || !q.data) return <ErrorState message={t(adminErrorKey(q.error))} onRetry={() => void q.refetch()} />;
  return <ReportBody report={q.data} />;
}

function ReportBody({ report }: { report: AdminReportDetail }) {
  const t = useT();
  const ago = useAgo();
  const fmt = useFormatDate();
  const resolve = useResolveReport();
  const [pending, setPending] = useState<Pending>(null);
  const [error, setError] = useState<string | null>(null);
  const open = report.status === 'open';
  const subjectName = personName(report.subject, t('admin.queue.unknown'));

  const start = (action: ResolveAction, messageId?: string) => {
    setError(null);
    setPending({ action, messageId });
  };

  const confirm = ({ reason, days }: { reason: string; days?: number }) => {
    if (!pending) return;
    resolve.mutate(
      { id: report.id, body: { action: pending.action, reason, days, messageId: pending.messageId } },
      {
        onSuccess: () => {
          setPending(null);
          useUi.getState().showToast({ message: t('admin.done.resolved'), tone: 'success' });
        },
        onError: (e) => setError(t(adminErrorKey(e))),
      },
    );
  };

  return (
    <View style={{ gap: spacing.md }} testID="admin-report-detail">
      <Section
        title={t('admin.report.title')}
        right={
          <View style={styles.wrapRow}>
            <PriorityPill priority={report.priority} />
            <ReportStatusPill status={report.status} />
          </View>
        }
      >
        <Text variant="heading">{t(`admin.category.${report.category}`)}</Text>
        <Text variant="caption" color={colors.textMuted}>
          {t('admin.report.created', { when: fmt(report.createdAt, true) })} · {t(`admin.priority.${report.priority}Hint`)}
          {report.resolvedAt ? ` · ${t('admin.report.resolved', { when: ago(report.resolvedAt) })}` : ''}
        </Text>
        <View style={styles.people}>
          <View style={styles.personCol}>
            <PersonLine person={report.subject} label={t('admin.report.subject')} />
          </View>
          <View style={styles.personCol}>
            <PersonLine person={report.reporter} label={t('admin.report.reporter')} />
          </View>
        </View>
        <View style={{ gap: 4 }}>
          <Text variant="overline" color={colors.textSubtle}>
            {t('admin.report.details')}
          </Text>
          <Text variant="body" color={report.details ? colors.text : colors.textSubtle}>
            {report.details ?? t('admin.report.noDetails')}
          </Text>
        </View>
        {report.riskFlags.length ? (
          <View style={styles.wrapRow}>
            <RiskPills flags={report.riskFlags} />
          </View>
        ) : null}
      </Section>

      <Section title={t('admin.report.evidence')}>
        {report.evidence.length ? (
          <>
            <Text variant="caption" color={colors.textSubtle}>
              {t('admin.report.evidenceHint')}
            </Text>
            <View style={{ gap: spacing.xs }}>
              {report.evidence.map((m) => (
                <EvidenceBubble key={m.id} m={m} canHide={open && m.author === 'subject' && !m.hidden} onHide={() => start('hide_message', m.id)} />
              ))}
            </View>
          </>
        ) : (
          <Text variant="small" color={colors.textSubtle}>
            {t('admin.report.noEvidence')}
          </Text>
        )}
      </Section>

      {open ? (
        <Section title={t('admin.report.decide')}>
          <View style={styles.actions}>
            <Button size="sm" variant="outline" icon="close-circle-outline" label={t('admin.action.dismiss')} onPress={() => start('dismiss')} testID="admin-act-dismiss" />
            <Button size="sm" variant="secondary" icon="alert-circle-outline" label={t('admin.action.warn')} onPress={() => start('warn')} testID="admin-act-warn" />
            <Button size="sm" variant="danger" icon="time-outline" label={t('admin.action.suspend')} onPress={() => start('suspend')} testID="admin-act-suspend" />
            <Button size="sm" variant="dark" icon="ban-outline" label={t('admin.action.ban')} onPress={() => start('ban')} testID="admin-act-ban" />
          </View>
        </Section>
      ) : null}

      <Section title={t('admin.report.history')}>
        <Text variant="overline" color={colors.textSubtle}>
          {t('admin.report.otherReports')}
        </Text>
        {report.subjectReports.length ? (
          <View style={{ gap: 4 }}>
            {report.subjectReports.map((r) => (
              <View key={r.id} style={styles.wrapRow}>
                <ReportStatusPill status={r.status} />
                <Text variant="small">{t(`admin.category.${r.category}`)}</Text>
                <Text variant="caption" color={colors.textSubtle}>
                  {ago(r.createdAt)}
                </Text>
              </View>
            ))}
          </View>
        ) : (
          <Text variant="small" color={colors.textSubtle}>
            {t('admin.report.none')}
          </Text>
        )}
        <Text variant="overline" color={colors.textSubtle}>
          {t('admin.report.actions')}
        </Text>
        <ActionHistory actions={report.subjectActions} />
      </Section>

      <ActionSheet
        visible={!!pending}
        onClose={() => setPending(null)}
        title={pending ? t(`admin.confirm.${pending.action}.title`, { name: subjectName }) : ''}
        body={pending ? t(`admin.confirm.${pending.action}.body`) : ''}
        confirmLabel={pending ? t(`admin.action.${pending.action}`) : ''}
        danger={pending?.action === 'suspend' || pending?.action === 'ban'}
        withDays={pending?.action === 'suspend'}
        loading={resolve.isPending}
        error={error}
        onConfirm={confirm}
      />
    </View>
  );
}

function EvidenceBubble({ m, canHide, onHide }: { m: AdminEvidenceMessage; canHide: boolean; onHide: () => void }) {
  const t = useT();
  const fmt = useFormatDate();
  const subject = m.author === 'subject';
  const system = m.author === 'system';
  return (
    <View style={[styles.msgRow, { justifyContent: system ? 'center' : subject ? 'flex-start' : 'flex-end' }]}>
      <View
        style={[
          styles.bubble,
          subject ? styles.bubbleSubject : styles.bubbleOther,
          m.reported && styles.bubbleReported,
          m.hidden && { opacity: 0.55 },
        ]}
      >
        <View style={styles.wrapRow}>
          <Text variant="caption" color={colors.textMuted}>
            {t(`admin.report.author.${m.author}`)} · {fmt(m.sentAt, true)}
          </Text>
          {m.reported ? <Text variant="caption" color={colors.danger}>· {t('admin.report.reported')}</Text> : null}
          {m.hidden ? <Text variant="caption" color={colors.textSubtle}>· {t('admin.report.hidden')}</Text> : null}
          {m.risk ? <Text variant="caption" color={colors.danger}>· {t(`admin.risk.${m.risk}`)}</Text> : null}
        </View>
        <Text variant="body" style={m.hidden ? { textDecorationLine: 'line-through' } : null}>
          {m.body}
        </Text>
        {canHide ? (
          <Pressable accessibilityRole="button" onPress={onHide} style={styles.hide} testID={`admin-hide-${m.id}`}>
            <Text variant="caption" color={colors.danger}>
              {t('admin.report.hide')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  row: {
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.md,
    gap: 6,
  },
  rowSelected: { borderColor: colors.primary, borderWidth: 2, padding: spacing.md - 1.5 },
  rowHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  people: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  personCol: { flexGrow: 1, flexBasis: 220 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  msgRow: { flexDirection: 'row' },
  bubble: { maxWidth: '85%', borderRadius: radii.md, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: 2 },
  bubbleSubject: { backgroundColor: palette.sand100 },
  bubbleOther: { backgroundColor: colors.primaryTint },
  bubbleReported: { borderWidth: 2, borderColor: colors.danger },
  hide: { alignSelf: 'flex-start', marginTop: 2, paddingVertical: 2 },
});
