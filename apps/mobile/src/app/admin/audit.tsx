import type { ModerationActionEntry, ModerationActionKind } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ActionPill, AdminShell, adminHref, useFormatDate } from '@/components/admin/parts';
import { adminErrorKey, useAdminAudit } from '@/components/admin/useAdmin';
import { Button, Chip, EmptyState, ErrorState, LoadingState, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, radii, spacing } from '@/theme';

const ACTIONS: ModerationActionKind[] = ['warn', 'hide_message', 'suspend', 'ban', 'reinstate', 'dismiss', 'approve_photo', 'reject_photo'];

/** Audit log of every moderation action, newest first, filterable by action, member or moderator. */
export default function AdminAuditScreen() {
  const t = useT();
  const [action, setAction] = useState<ModerationActionKind | undefined>();
  const [subject, setSubject] = useState<{ id: string; name: string } | null>(null);
  const [moderator, setModerator] = useState<{ id: string; name: string } | null>(null);
  const q = useAdminAudit({ action, subjectId: subject?.id, moderatorId: moderator?.id });
  const entries = q.data?.pages.flatMap((p) => p.entries) ?? [];

  return (
    <AdminShell tab="audit">
      <View style={styles.chips}>
        <Chip size="sm" tone="neutral" label={t('admin.audit.allActions')} selected={!action} onPress={() => setAction(undefined)} />
        {ACTIONS.map((a) => (
          <Chip key={a} size="sm" tone="neutral" label={t(`admin.action.${a}`)} selected={action === a} onPress={() => setAction(a)} />
        ))}
      </View>
      <View style={styles.chips}>
        {subject ? <Chip size="sm" icon="close" label={t('admin.audit.subject', { name: subject.name })} selected onPress={() => setSubject(null)} /> : null}
        {moderator ? <Chip size="sm" icon="close" label={t('admin.audit.moderator', { name: moderator.name })} selected onPress={() => setModerator(null)} /> : null}
        {!subject && !moderator ? (
          <Text variant="caption" color={colors.textSubtle}>
            {t('admin.audit.filterHint')}
          </Text>
        ) : null}
      </View>
      {q.isLoading ? (
        <LoadingState />
      ) : q.isError ? (
        <ErrorState message={t(adminErrorKey(q.error))} onRetry={() => void q.refetch()} />
      ) : entries.length === 0 ? (
        <EmptyState icon="list-outline" title={t('admin.queue.emptyTitle')} body={t('admin.audit.empty')} />
      ) : (
        <View style={styles.table}>
          {entries.map((e, i) => (
            <AuditRow
              key={e.id}
              e={e}
              first={i === 0}
              onSubject={() => setSubject({ id: e.subject.id, name: e.subject.firstName ?? '—' })}
              onModerator={() => setModerator({ id: e.moderator.id, name: e.moderator.firstName ?? '—' })}
            />
          ))}
        </View>
      )}
      {q.hasNextPage ? <Button variant="outline" label={t('admin.audit.loadMore')} loading={q.isFetchingNextPage} onPress={() => void q.fetchNextPage()} /> : null}
    </AdminShell>
  );
}

function AuditRow({ e, first, onSubject, onModerator }: { e: ModerationActionEntry; first: boolean; onSubject: () => void; onModerator: () => void }) {
  const t = useT();
  const fmt = useFormatDate();
  const days = typeof e.meta?.days === 'number' ? e.meta.days : null;
  return (
    <View style={[styles.row, !first && styles.sep]} testID={`admin-audit-${e.id}`}>
      <Text variant="caption" color={colors.textSubtle} style={styles.when}>
        {fmt(e.createdAt, true)}
      </Text>
      <View style={styles.actionCol}>
        <ActionPill action={e.action} />
      </View>
      <View style={styles.main}>
        <View style={styles.names}>
          <Pressable onPress={onSubject} accessibilityRole="button">
            <Text variant="bodyStrong" style={styles.link}>
              {e.subject.firstName ?? '—'}
            </Text>
          </Pressable>
          <Pressable onPress={() => router.push(adminHref.account(e.subject.id))} accessibilityRole="link" accessibilityLabel={t('admin.report.viewAccount')}>
            <Text variant="caption" color={colors.primary}>
              {t('admin.report.viewAccount')}
            </Text>
          </Pressable>
          {days ? (
            <Text variant="caption" color={colors.textMuted}>
              · {t('admin.audit.days', { n: days })}
            </Text>
          ) : null}
        </View>
        <Text variant="small" color={colors.textMuted}>
          {e.reason ?? '—'}
        </Text>
      </View>
      <Pressable onPress={onModerator} accessibilityRole="button" style={styles.modCol}>
        <Text variant="caption" color={colors.textMuted} style={styles.link} numberOfLines={1}>
          {t('admin.audit.by', { name: e.moderator.firstName ?? t(`admin.role.${e.moderator.role}`) })}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  table: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  when: { width: 120, paddingTop: 3 },
  actionCol: { width: 130 },
  main: { flex: 1, minWidth: 200, gap: 2 },
  names: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
  modCol: { maxWidth: 200, paddingTop: 3 },
  link: { textDecorationLine: 'underline' },
});
