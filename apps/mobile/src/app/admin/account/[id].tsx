import type { AdminAccountDetail, AdminReportBrief } from '@halal-meet/core';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ActionHistory, ActionSheet, AdminShell, Pill, PersonLine, ReportStatusPill, Section, useAgo, useFormatDate } from '@/components/admin/parts';
import { adminErrorKey, useAdminAccount, useReinstate } from '@/components/admin/useAdmin';
import { Avatar, Button, ErrorState, LoadingState, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { languageLabel } from '@/lib/cities';
import { useUi } from '@/state/ui';
import { colors, palette, spacing } from '@/theme';

/** Account detail: summary, profile facts, verifications, reports for/against, moderation history, photos. */
export default function AdminAccountScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT();
  const q = useAdminAccount(id);
  return (
    <AdminShell back>
      {q.isLoading ? <LoadingState /> : q.isError || !q.data ? <ErrorState message={t(adminErrorKey(q.error))} onRetry={() => void q.refetch()} /> : <AccountBody d={q.data} />}
    </AdminShell>
  );
}

function AccountBody({ d }: { d: AdminAccountDetail }) {
  const t = useT();
  const locale = useLocale();
  const ago = useAgo();
  const fmt = useFormatDate();
  const reinstate = useReinstate();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const a = d.account;
  const restricted = a.status === 'suspended' || a.status === 'banned';
  const name = a.firstName ?? t('admin.queue.unknown');

  return (
    <View style={{ gap: spacing.md }} testID="admin-account">
      <Section title={t('admin.account.title')}>
        <PersonLine person={a} />
        <View style={styles.facts}>
          <Fact label={t('admin.account.phone')} value={a.phoneMasked} />
        </View>
        <Text variant="caption" color={colors.textMuted}>
          {t('admin.account.joined', { date: fmt(a.createdAt) })}
          {a.lastActiveAt ? ` · ${t('admin.account.lastActive', { when: ago(a.lastActiveAt) })}` : ''} · {t('admin.account.activeMatches', { n: d.activeMatches })}
        </Text>
        {restricted ? (
          <Button
            label={t('admin.account.reinstate')}
            icon="refresh-circle-outline"
            variant="secondary"
            onPress={() => {
              setError(null);
              setOpen(true);
            }}
            testID="admin-reinstate"
            style={{ alignSelf: 'flex-start' }}
          />
        ) : null}
      </Section>

      <View style={styles.grid}>
        <View style={styles.col}>
          <Section title={t('admin.account.profile')}>
            {d.profile ? (
              <View style={{ gap: spacing.sm }}>
                {d.profile.about ? <Fact label={t('admin.account.about')} value={d.profile.about} /> : null}
                {d.profile.profession ? <Fact label={t('admin.account.profession')} value={d.profile.profession} /> : null}
                <Fact label={t('admin.account.languages')} value={d.profile.languages.map((l) => languageLabel(l, locale)).join(', ')} />
                <Text variant="caption" color={colors.textSubtle}>
                  {d.profile.maritalStatus} · {d.profile.intention} · {d.profile.halalMode}
                </Text>
              </View>
            ) : (
              <Text variant="small" color={colors.textSubtle}>
                {t('admin.account.noProfile')}
              </Text>
            )}
          </Section>
          <Section title={t('admin.account.verifications')}>
            <View style={styles.wrap}>
              {d.verifications.map((v, i) => (
                <Pill
                  key={`${v.kind}-${i}`}
                  label={`${v.kind} · ${v.status}`}
                  bg={v.status === 'approved' ? colors.primaryTint : palette.sand200}
                  fg={v.status === 'approved' ? colors.primary : palette.navy700}
                  icon={v.status === 'approved' ? 'checkmark' : undefined}
                />
              ))}
            </View>
          </Section>
          <Section title={t('admin.account.photos')}>
            {d.photos.length ? (
              <View style={styles.wrap}>
                {d.photos.map((p) => (
                  <View key={p.id} style={{ alignItems: 'center', gap: 4 }}>
                    <Avatar id={p.id} name={name} photoUrl={p.url} size={64} shape="rounded" />
                    <Text variant="caption" color={colors.textMuted}>
                      {t(`admin.photos.${p.status}`)}
                    </Text>
                  </View>
                ))}
              </View>
            ) : (
              <Text variant="small" color={colors.textSubtle}>
                {t('admin.report.none')}
              </Text>
            )}
          </Section>
        </View>
        <View style={styles.col}>
          <Section title={t('admin.account.reportsAgainst')}>
            <Briefs items={d.reportsAgainst} />
          </Section>
          <Section title={t('admin.account.reportsBy')}>
            <Briefs items={d.reportsBy} />
          </Section>
          <Section title={t('admin.account.actions')}>
            <ActionHistory actions={d.actions} />
          </Section>
        </View>
      </View>

      <ActionSheet
        visible={open}
        onClose={() => setOpen(false)}
        title={t('admin.confirm.reinstate.title', { name })}
        body={t('admin.confirm.reinstate.body')}
        confirmLabel={t('admin.action.reinstate')}
        loading={reinstate.isPending}
        error={error}
        onConfirm={({ reason }) =>
          reinstate.mutate(
            { id: a.id, reason },
            {
              onSuccess: () => {
                setOpen(false);
                useUi.getState().showToast({ message: t('admin.done.reinstated'), tone: 'success' });
              },
              onError: (e) => setError(t(adminErrorKey(e))),
            },
          )
        }
      />
    </View>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2, flexBasis: 160, flexGrow: 1 }}>
      <Text variant="overline" color={colors.textSubtle}>
        {label}
      </Text>
      <Text variant="small">{value}</Text>
    </View>
  );
}

function Briefs({ items }: { items: AdminReportBrief[] }) {
  const t = useT();
  const ago = useAgo();
  if (!items.length) {
    return (
      <Text variant="small" color={colors.textSubtle}>
        {t('admin.report.none')}
      </Text>
    );
  }
  return (
    <View style={{ gap: 6 }}>
      {items.map((r) => (
        <View key={r.id} style={styles.wrap}>
          <ReportStatusPill status={r.status} />
          <Text variant="small">{t(`admin.category.${r.category}`)}</Text>
          <Text variant="caption" color={colors.textSubtle}>
            {ago(r.createdAt)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, alignItems: 'flex-start' },
  col: { flexGrow: 1, flexBasis: 340, gap: spacing.md },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
});
