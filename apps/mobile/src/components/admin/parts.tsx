/** Building blocks of the moderation console: shell (gate + stats + nav), pills, person lines, action sheet. */
import {
  isStaffRole,
  type AdminAccountStatus,
  type AdminAccountSummary,
  type AdminReportPriority,
  type AdminReportStatus,
  type ModerationActionEntry,
  SUSPEND_DAY_OPTIONS,
} from '@halal-meet/core';
import { router, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/api';
import { useMe } from '@/api/hooks';
import { Avatar, Button, Chip, EmptyState, Field, Icon, IconButton, LoadingState, Sheet, Text, TextField, type IconName } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { countryName, formatDate, relativeTime } from '@/lib/format';
import { colors, palette, radii, spacing } from '@/theme';

import { useAdminStats } from './useAdmin';

export const ADMIN_MAX_WIDTH = 1200;
export const WIDE_BREAKPOINT = 960;

export const adminHref = {
  reports: '/admin' as Href,
  photos: '/admin/photos' as Href,
  audit: '/admin/audit' as Href,
  report: (id: string) => `/admin/report/${id}` as Href,
  account: (id: string) => `/admin/account/${id}` as Href,
};

export function useIsWide(): boolean {
  return useWindowDimensions().width >= WIDE_BREAKPOINT;
}

/** "3h ago"-style label from `common.time.*`. */
export function useAgo() {
  const t = useT();
  return (iso: string | null | undefined) => {
    if (!iso) return '';
    const r = relativeTime(iso);
    return t(`common.time.${r.key}`, { n: r.n });
  };
}

export function useFormatDate() {
  const locale = useLocale();
  return (iso: string | null | undefined, withTime = false) =>
    formatDate(iso, locale, withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

// ───────── Shell ─────────

type Tab = 'reports' | 'photos' | 'audit';

/**
 * Wraps every console page: staff gate (role from GET /me), title bar, stats header and section tabs.
 * Content is full width up to ADMIN_MAX_WIDTH so tables stay dense on the web.
 */
export function AdminShell({ tab, children, scroll = true, back }: { tab?: Tab; children: ReactNode; scroll?: boolean; back?: boolean }) {
  const t = useT();
  const me = useMe();
  const staff = isStaffRole(me.data?.role);
  const stats = useAdminStats(staff);

  if (me.isLoading) {
    return (
      <SafeAreaView style={styles.fill}>
        <LoadingState />
      </SafeAreaView>
    );
  }
  if (!staff) {
    return (
      <SafeAreaView style={styles.fill}>
        <EmptyState
          icon="shield-outline"
          title={t('admin.staffOnly.title')}
          body={`${t('admin.staffOnly.body')}${api.admin.dev ? `\n\n${t('admin.staffOnly.demoHint')}` : ''}`}
          action={<Button label={t('admin.backToApp')} variant="outline" onPress={() => router.replace('/')} />}
        />
      </SafeAreaView>
    );
  }

  const s = stats.data;
  const tabs: Array<{ key: Tab; icon: IconName; href: Href; badge?: number }> = [
    { key: 'reports', icon: 'flag-outline', href: adminHref.reports, badge: s?.openReports },
    { key: 'photos', icon: 'images-outline', href: adminHref.photos, badge: s?.pendingPhotos },
    { key: 'audit', icon: 'list-outline', href: adminHref.audit },
  ];

  const header = (
    <View style={styles.column}>
      <View style={styles.titleBar}>
        {back ? (
          <IconButton
            name="chevron-back"
            directional
            accessibilityLabel={t('common.actions.back')}
            onPress={() => (router.canGoBack() ? router.back() : router.replace(adminHref.reports))}
          />
        ) : (
          <IconButton name="close" accessibilityLabel={t('admin.backToApp')} onPress={() => router.replace('/')} />
        )}
        <View style={styles.fill}>
          <Text variant="heading">{t('admin.title')}</Text>
          <Text variant="caption" color={colors.textMuted}>
            {t('admin.subtitle')} · {t(`admin.role.${me.data?.role ?? 'moderator'}`)}
          </Text>
        </View>
        <IconButton name="refresh" accessibilityLabel={t('admin.refresh')} onPress={() => void stats.refetch()} />
      </View>
      <View style={styles.stats}>
        <StatTile label={t('admin.stats.open')} value={s?.openReports} sub={s ? t('admin.stats.breakdown', s.openByPriority) : undefined} tone={s && s.openByPriority.p0 > 0 ? 'danger' : 'default'} />
        <StatTile label={t('admin.stats.pendingPhotos')} value={s?.pendingPhotos} />
        <StatTile label={t('admin.stats.actions7d')} value={s?.actionsLast7Days} />
        <StatTile label={t('admin.stats.restricted')} value={s ? t('admin.stats.restrictedValue', { s: s.suspendedAccounts, b: s.bannedAccounts }) : undefined} />
      </View>
      {tab ? (
        <View style={styles.tabs} accessibilityRole="tablist">
          {tabs.map((x) => {
            const active = x.key === tab;
            return (
              <Pressable
                key={x.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => !active && router.replace(x.href)}
                style={[styles.tab, active && styles.tabActive]}
                testID={`admin-tab-${x.key}`}
              >
                <Icon name={x.icon} size={16} color={active ? colors.primary : colors.textMuted} />
                <Text variant="small" weight={active ? 'semibold' : 'medium'} color={active ? colors.text : colors.textMuted}>
                  {t(`admin.nav.${x.key}`)}
                </Text>
                {x.badge ? (
                  <View style={styles.badge}>
                    <Text variant="caption" color={palette.white} fontLocale="en" style={{ fontSize: 10, lineHeight: 13 }}>
                      {x.badge}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: colors.bg }]} edges={['top', 'bottom']} testID="admin-shell">
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {header}
          <View style={[styles.column, styles.body]}>{children}</View>
        </ScrollView>
      ) : (
        <View style={styles.fill}>
          {header}
          <View style={[styles.column, styles.body, styles.fill]}>{children}</View>
        </View>
      )}
    </SafeAreaView>
  );
}

function StatTile({ label, value, sub, tone = 'default' }: { label: string; value?: number | string; sub?: string; tone?: 'default' | 'danger' }) {
  return (
    <View style={[styles.stat, tone === 'danger' && { borderColor: colors.danger }]}>
      <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
        {label}
      </Text>
      <Text variant="title" color={tone === 'danger' ? colors.danger : colors.text} fontLocale="en">
        {value ?? '–'}
      </Text>
      {sub ? (
        <Text variant="caption" color={colors.textSubtle} fontLocale="en" numberOfLines={1}>
          {sub}
        </Text>
      ) : null}
    </View>
  );
}

// ───────── Pills ─────────

const PRIORITY_COLORS: Record<AdminReportPriority, { bg: string; fg: string }> = {
  p0: { bg: colors.danger, fg: palette.white },
  p1: { bg: colors.discussSoft, fg: '#9A5E12' },
  p2: { bg: palette.sand200, fg: palette.navy700 },
};

export function Pill({ label, bg, fg, icon }: { label: string; bg: string; fg: string; icon?: IconName }) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? <Icon name={icon} size={12} color={fg} /> : null}
      <Text variant="caption" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function PriorityPill({ priority }: { priority: AdminReportPriority }) {
  const t = useT();
  const c = PRIORITY_COLORS[priority];
  return <Pill label={t(`admin.priority.${priority}`)} bg={c.bg} fg={c.fg} />;
}

export function ReportStatusPill({ status }: { status: AdminReportStatus }) {
  const t = useT();
  const c = status === 'open' ? { bg: colors.primaryTint, fg: colors.primary } : status === 'actioned' ? { bg: palette.navy900, fg: palette.ivory50 } : { bg: palette.sand200, fg: palette.navy500 };
  return <Pill label={t(`admin.status.${status}`)} bg={c.bg} fg={c.fg} />;
}

export function AccountStatusPill({ status, until }: { status: AdminAccountStatus; until?: string | null }) {
  const t = useT();
  const fmt = useFormatDate();
  if (status === 'active') return null;
  const danger = status === 'banned' || status === 'suspended';
  const label = status === 'suspended' && until ? `${t('admin.accountStatus.suspended')} · ${t('admin.account.until', { date: fmt(until) })}` : t(`admin.accountStatus.${status}`);
  return <Pill label={label} bg={danger ? colors.dangerSoft : palette.sand200} fg={danger ? colors.danger : palette.navy700} icon={danger ? 'ban-outline' : undefined} />;
}

export function RiskPills({ flags }: { flags: string[] }) {
  const t = useT();
  if (flags.length === 0) return null;
  return (
    <>
      {flags.map((f) => (
        <Pill key={f} label={t(`admin.risk.${f}`)} bg={colors.dangerSoft} fg={colors.danger} icon="warning-outline" />
      ))}
    </>
  );
}

// ───────── People ─────────

export function personName(p: { firstName: string | null }, fallback: string): string {
  return p.firstName ?? fallback;
}

/** Avatar + name + age · place + status/role pills. Tappable → account page. */
export function PersonLine({ person, label, compact }: { person: AdminAccountSummary; label?: string; compact?: boolean }) {
  const t = useT();
  const locale = useLocale();
  const name = personName(person, t('admin.queue.unknown'));
  const meta = [person.age ? String(person.age) : null, person.country ? countryName(person.country, locale) : null, person.city].filter(Boolean).join(' · ');
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => router.push(adminHref.account(person.id))}
      style={({ pressed }) => [styles.person, pressed && { opacity: 0.7 }]}
    >
      <Avatar id={person.id} name={name} photoUrl={person.photoUrl} size={compact ? 32 : 40} />
      <View style={styles.fill}>
        {label ? (
          <Text variant="overline" color={colors.textSubtle}>
            {label}
          </Text>
        ) : null}
        <View style={styles.wrapRow}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {name}
          </Text>
          {person.identityVerified ? <Icon name="shield-checkmark" size={14} color={colors.primary} /> : null}
          {person.role !== 'member' ? <Pill label={t(`admin.role.${person.role}`)} bg={palette.navy900} fg={palette.ivory50} /> : null}
          <AccountStatusPill status={person.status} until={person.suspendedUntil} />
        </View>
        {meta ? (
          <Text variant="caption" color={colors.textMuted} numberOfLines={1}>
            {meta}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

// ───────── Sections & history ─────────

export function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <Text variant="overline" color={colors.textMuted} style={styles.fill}>
          {title}
        </Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function ActionHistory({ actions, showSubject }: { actions: ModerationActionEntry[]; showSubject?: boolean }) {
  const t = useT();
  const ago = useAgo();
  if (actions.length === 0) {
    return (
      <Text variant="small" color={colors.textSubtle}>
        {t('admin.report.none')}
      </Text>
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      {actions.map((a) => (
        <View key={a.id} style={styles.historyRow}>
          <ActionPill action={a.action} />
          <View style={styles.fill}>
            <Text variant="small">
              {showSubject ? `${a.subject.firstName ?? '—'} · ` : ''}
              {a.reason ?? '—'}
            </Text>
            <Text variant="caption" color={colors.textSubtle}>
              {t('admin.audit.by', { name: a.moderator.firstName ?? t(`admin.role.${a.moderator.role}`) })} · {ago(a.createdAt)}
              {typeof a.meta?.days === 'number' ? ` · ${t('admin.audit.days', { n: a.meta.days })}` : ''}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

const ACTION_COLORS: Record<string, { bg: string; fg: string; icon: IconName }> = {
  dismiss: { bg: palette.sand200, fg: palette.navy700, icon: 'close-circle-outline' },
  warn: { bg: colors.discussSoft, fg: '#9A5E12', icon: 'alert-circle-outline' },
  hide_message: { bg: palette.sand200, fg: palette.navy700, icon: 'eye-off-outline' },
  suspend: { bg: colors.dangerSoft, fg: colors.danger, icon: 'time-outline' },
  ban: { bg: colors.danger, fg: palette.white, icon: 'ban-outline' },
  reinstate: { bg: colors.primaryTint, fg: colors.primary, icon: 'refresh-circle-outline' },
  approve_photo: { bg: colors.primaryTint, fg: colors.primary, icon: 'checkmark-circle-outline' },
  reject_photo: { bg: colors.dangerSoft, fg: colors.danger, icon: 'image-outline' },
};

export function ActionPill({ action }: { action: string }) {
  const t = useT();
  const c = ACTION_COLORS[action] ?? ACTION_COLORS.dismiss!;
  return <Pill label={t(`admin.action.${action}`)} bg={c.bg} fg={c.fg} icon={c.icon} />;
}

// ───────── Action sheet (confirmation + reason) ─────────

export interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  body: string;
  confirmLabel: string;
  danger?: boolean;
  /** Ask for a suspension length. */
  withDays?: boolean;
  /** Quick reasons (tap to fill). */
  presets?: string[];
  loading?: boolean;
  error?: string | null;
  showNeutralNote?: boolean;
  onConfirm: (input: { reason: string; days?: number }) => void;
}

/** Every moderation decision goes through this: what will happen, an internal reason, then confirm. */
export function ActionSheet({ visible, onClose, title, body, confirmLabel, danger, withDays, presets, loading, error, showNeutralNote = true, onConfirm }: ActionSheetProps) {
  const t = useT();
  const [reason, setReason] = useState('');
  const [days, setDays] = useState<number>(7);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (visible) {
      setReason('');
      setDays(7);
      setTouched(false);
    }
  }, [visible]);
  const tooShort = reason.trim().length < 3;
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID="admin-action-sheet"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            label={confirmLabel}
            variant={danger ? 'danger' : 'primary'}
            fullWidth
            loading={loading}
            onPress={() => {
              setTouched(true);
              if (!tooShort) onConfirm({ reason: reason.trim(), days: withDays ? days : undefined });
            }}
            testID="admin-action-confirm"
          />
          <Button label={t('common.actions.cancel')} variant="ghost" fullWidth onPress={onClose} />
        </View>
      }
    >
      <Text variant="body" color={colors.textMuted}>
        {body}
      </Text>
      {showNeutralNote ? (
        <Text variant="caption" color={colors.textSubtle}>
          {t('admin.confirm.neutral')}
        </Text>
      ) : null}
      {withDays ? (
        <Field label={t('admin.days.label')}>
          <View style={styles.wrapRow}>
            {SUSPEND_DAY_OPTIONS.map((d) => (
              <Chip key={d} size="sm" label={d === 1 ? t('admin.days.one') : t('admin.days.other', { n: d })} selected={days === d} onPress={() => setDays(d)} tone="danger" />
            ))}
          </View>
        </Field>
      ) : null}
      {presets?.length ? (
        <View style={styles.wrapRow}>
          {presets.map((p) => (
            <Chip key={p} size="sm" label={p} tone="neutral" selected={reason === p} onPress={() => setReason(p)} />
          ))}
        </View>
      ) : null}
      <Field label={t('admin.reason.label')} error={touched && tooShort ? t('admin.reason.tooShort') : error ?? null}>
        <TextField value={reason} onChangeText={setReason} placeholder={t('admin.reason.placeholder')} multiline testID="admin-reason" />
      </Field>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scroll: { paddingBottom: spacing.huge },
  column: { width: '100%', maxWidth: ADMIN_MAX_WIDTH, alignSelf: 'center', paddingHorizontal: spacing.lg },
  body: { paddingTop: spacing.md, gap: spacing.md },
  titleBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  stat: {
    flexGrow: 1,
    flexBasis: 150,
    backgroundColor: colors.card,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  tabs: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.md, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabActive: { borderBottomColor: colors.primary },
  badge: { minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: colors.danger, alignItems: 'center', justifyContent: 'center' },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, alignSelf: 'flex-start' },
  person: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wrapRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs },
  section: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  historyRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
