import type { AdminReportCategory, AdminReportStatus } from '@halal-meet/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AdminShell, adminHref, useIsWide } from '@/components/admin/parts';
import { ReportDetailView, ReportRow } from '@/components/admin/ReportDetail';
import { adminErrorKey, useAdminReports } from '@/components/admin/useAdmin';
import { Chip, EmptyState, ErrorState, LoadingState, Segmented, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

const CATEGORIES: Array<AdminReportCategory | 'all'> = ['all', 'underage', 'scam', 'harassment', 'inappropriate', 'fake_profile', 'other'];

/** Report queue: status + category filters; on wide screens the selected report opens beside the list. */
export default function AdminReportsScreen() {
  const t = useT();
  const wide = useIsWide();
  const [status, setStatus] = useState<AdminReportStatus>('open');
  const [category, setCategory] = useState<AdminReportCategory | 'all'>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const q = useAdminReports(status, category === 'all' ? undefined : category);

  useEffect(() => {
    if (!wide || !q.data) return;
    if (!selected || !q.data.some((r) => r.id === selected)) setSelected(q.data[0]?.id ?? null);
  }, [wide, q.data, selected]);

  const list = () => {
    if (q.isLoading) return <LoadingState />;
    if (q.isError) return <ErrorState message={t(adminErrorKey(q.error))} onRetry={() => void q.refetch()} />;
    if (!q.data?.length) {
      return <EmptyState icon="checkmark-done-outline" title={t('admin.queue.emptyTitle')} body={t(status === 'open' ? 'admin.queue.emptyOpen' : 'admin.queue.emptyOther')} />;
    }
    return (
      <View style={{ gap: spacing.sm }}>
        {q.data.map((r) => (
          <ReportRow key={r.id} item={r} selected={wide && r.id === selected} onPress={() => (wide ? setSelected(r.id) : router.push(adminHref.report(r.id)))} />
        ))}
      </View>
    );
  };

  return (
    <AdminShell tab="reports">
      <View style={styles.filters}>
        <Segmented
          value={status}
          onChange={(v) => {
            setStatus(v);
            setSelected(null);
          }}
          options={(['open', 'actioned', 'dismissed'] as const).map((s) => ({ value: s, label: t(`admin.status.${s}`) }))}
          style={{ maxWidth: 420 }}
        />
        <View style={styles.chips}>
          {CATEGORIES.map((c) => (
            <Chip key={c} size="sm" tone="neutral" label={t(`admin.category.${c}`)} selected={category === c} onPress={() => setCategory(c)} />
          ))}
        </View>
      </View>
      {wide ? (
        <View style={styles.split}>
          <View style={styles.listCol}>{list()}</View>
          <View style={styles.detailCol}>
            {selected ? (
              <ReportDetailView key={selected} id={selected} />
            ) : (
              <Text variant="small" color={colors.textSubtle} center style={{ marginTop: spacing.xxl }}>
                {t('admin.queue.select')}
              </Text>
            )}
          </View>
        </View>
      ) : (
        list()
      )}
    </AdminShell>
  );
}

const styles = StyleSheet.create({
  filters: { gap: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  split: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.lg },
  listCol: { flex: 5, minWidth: 0 },
  detailCol: { flex: 7, minWidth: 0 },
});
