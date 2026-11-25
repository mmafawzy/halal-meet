import { QUESTIONS, type Dimension, type Locale, type MeResponse, type VerificationKind } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { useDevGrant, useGuardians, usePassport, useVerifyIdentityDemo } from '@/api/hooks';
import { HalalModeBadge, PlanBadge, VerificationBadges } from '@/components/profile/Badges';
import { Avatar, Button, Card, CompatRing, Icon, ListRow, ProgressBar, RowGroup, Segmented, Text } from '@/components/ui';
import { applyLocale } from '@/i18n/rtl';
import { useLocale, useT } from '@/i18n';
import { cityLabel, languageLabel } from '@/lib/cities';
import { countryName, timeUntil } from '@/lib/format';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, palette, spacing } from '@/theme';

import { useAccountActions } from './accountActions';
import { ConfirmSheet } from './ConfirmSheet';
import { missingItems, strengthLevel } from './strength';
import { useSaveProfile } from './useSaveProfile';

const QUESTION_TOTAL = QUESTIONS.length;

export function listJoin(items: string[], locale: Locale): string {
  return items.join(locale === 'ar' ? '، ' : ', ');
}

// ───────── Profile summary + strength (screen 56) ─────────

export function ProfileSummaryCard({ me }: { me: MeResponse }) {
  const t = useT();
  const locale = useLocale();
  const draftPhoto = useSession((s) => s.draft.photoUri);
  const hasGuardian = (useGuardians().data?.length ?? 0) > 0;
  const p = me.profile!;
  const photo = p.photoUrl ?? draftPhoto;
  const pct = Math.round(p.profileStrength);
  const level = strengthLevel(pct);
  const missing = missingItems(p, { hasPhoto: !!photo, answersCount: me.answersCount, hasGuardian });

  return (
    <Card>
      <View style={styles.summaryTop}>
        <Avatar id={p.id} name={p.firstName} photoUrl={photo} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="heading" numberOfLines={1}>
            {p.firstName}, {t('common.age', { age: p.age })}
          </Text>
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {cityLabel(p.country, p.city, locale)} · {countryName(p.country, locale)}
          </Text>
          <View style={styles.badges}>
            <HalalModeBadge mode={p.halalMode} />
            <PlanBadge tier={me.entitlements.tier} />
          </View>
        </View>
      </View>

      <VerificationBadges kinds={p.verifications} style={{ marginTop: spacing.md }} />

      <View style={styles.strength}>
        <View accessible accessibilityLabel={`${t('me.strength.title')} ${pct}%`}>
          <CompatRing pct={pct} size={64} color={level === 'excellent' ? palette.gold500 : colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="overline" color={colors.textMuted}>
            {t('me.strength.title')}
          </Text>
          <Text variant="subheading">{t(`me.strength.levels.${level}`)}</Text>
          <Text variant="caption" color={colors.textMuted}>
            {t('me.strength.hint')}
          </Text>
        </View>
      </View>

      <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
        <Text variant="small" weight="semibold">
          {missing.length ? t('me.strength.next') : t('me.strength.done')}
        </Text>
        {missing.slice(0, 3).map((m) => (
          <View key={m} style={styles.effect}>
            <Icon name="add-circle-outline" size={16} color={colors.primary} style={{ marginTop: 2 }} />
            <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
              {t(`me.strength.effects.${m}`, { n: me.answersCount, total: QUESTION_TOTAL })}
            </Text>
          </View>
        ))}
      </View>

      <Button
        label={t('me.strength.edit')}
        variant="secondary"
        size="sm"
        icon="create-outline"
        onPress={() => router.push('/settings/edit')}
        style={{ marginTop: spacing.md, alignSelf: 'flex-start' }}
        testID="me-edit-profile"
      />
    </Card>
  );
}

// ───────── Verification (screen 57) ─────────

const VERIFY_KINDS: VerificationKind[] = ['phone', 'identity', 'profession', 'education', 'marital', 'family'];

export function VerificationCard({ me }: { me: MeResponse }) {
  const t = useT();
  const verify = useVerifyIdentityDemo();
  const kinds = me.profile?.verifications ?? [];
  const identity = kinds.includes('identity');
  const canDemo = !!api.dev;

  const run = () =>
    verify.mutate(undefined, {
      onSuccess: () => useUi.getState().showToast({ message: t('me.verifyKinds.verifiedToast'), tone: 'success' }),
      onError: () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' }),
    });

  return (
    <Card>
      <View style={styles.cardHead}>
        <Icon name="shield-checkmark-outline" size={20} color={colors.primary} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {t('me.verification.title')}
        </Text>
        <Text variant="small" weight="semibold" color={identity ? colors.primary : colors.textMuted}>
          {identity ? t('me.verification.verified') : t('me.verification.pending')}
        </Text>
      </View>
      <Text variant="caption" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
        {t('me.verification.body')}
      </Text>

      <View style={styles.kinds}>
        {VERIFY_KINDS.map((k) => {
          const done = kinds.includes(k);
          return (
            <View key={k} style={styles.kindRow}>
              <Icon name={done ? 'checkmark-circle' : 'ellipse-outline'} size={18} color={done ? colors.primary : colors.textSubtle} />
              <Text variant="small" style={{ flex: 1 }}>
                {t(`common.verification.${k}`)}
              </Text>
              <Text variant="caption" color={done ? colors.primary : colors.textSubtle}>
                {done ? t('me.verifyKinds.done') : t('me.verifyKinds.todo')}
              </Text>
            </View>
          );
        })}
      </View>

      {!identity ? (
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="caption" color={colors.textMuted}>
            {t('me.verification.identityNeeded')}
          </Text>
          {canDemo ? (
            <Button label={t('me.verification.verify')} icon="finger-print-outline" loading={verify.isPending} onPress={run} testID="me-verify-demo" />
          ) : (
            <Text variant="caption" color={colors.textSubtle}>
              {t('me.verifyKinds.liveNote')}
            </Text>
          )}
        </View>
      ) : null}
      {canDemo ? (
        <Text variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.sm }}>
          {t('me.verifyKinds.demoOnly')}
        </Text>
      ) : null}
    </Card>
  );
}

// ───────── Plan, usage and Passport ─────────

export function PlanCard({ me }: { me: MeResponse }) {
  const t = useT();
  const passport = usePassport();
  const { tier, limits } = me.entitlements;
  const u = me.usage;
  const planName = t(`common.plan.${tier}`);
  const left = timeUntil(u.resetsAt);
  const activeDest = passport.data?.destinations.filter((d) => d.status === 'active' || d.status === 'scheduled').length ?? 0;
  const freePass = passport.data?.entitlements.freePassAvailable ?? me.entitlements.passport.freePassAvailable;

  const passportBody =
    activeDest > 0 ? t('me.plan.passportBody', { count: activeDest }) : freePass ? t('me.plan.passportFreePass') : t('me.plan.passportNone');

  return (
    <View style={{ gap: spacing.md }}>
      <Card tone={tier === 'free' ? 'default' : 'premium'}>
        <View style={styles.cardHead}>
          <Icon name="sparkles-outline" size={20} color={tier === 'free' ? colors.primary : '#8A6A22'} />
          <Text variant="subheading" style={{ flex: 1 }}>
            {t('me.plan.current', { plan: planName })}
          </Text>
        </View>
        <Text variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          {tier === 'free' ? t('me.plan.freeBody', { limit: limits.dailyInterests ?? 10 }) : t('me.plan.paidBody')}
        </Text>

        <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
          <UsageRow
            label={t('me.usage.interests')}
            used={u.interestsToday}
            limit={u.interestsLimit}
          />
          <UsageRow label={t('me.usage.serious')} used={u.seriousUsed} limit={u.seriousLimit} />
          <View style={styles.usageHead}>
            <Text variant="small" style={{ flex: 1 }}>
              {t('me.usage.topPicks')}
            </Text>
            <Text variant="small" weight="semibold" fontLocale="en">
              {u.topPicksPerDay}
            </Text>
          </View>
          {u.interestsLimit !== null ? (
            <Text variant="caption" color={colors.textSubtle}>
              {t('me.usage.resets', { time: t('common.time.hm', { h: left.h, m: left.m }) })}
            </Text>
          ) : null}
        </View>

        <Button
          label={tier === 'free' ? t('me.plan.upgrade') : t('me.plan.compare')}
          variant={tier === 'free' ? 'gold' : 'outline'}
          size="sm"
          onPress={() => router.push('/paywall')}
          style={{ marginTop: spacing.lg, alignSelf: 'flex-start' }}
          testID="me-upgrade"
        />
      </Card>

      <RowGroup>
        <ListRow icon="airplane-outline" label={t('me.plan.passport')} description={passportBody} onPress={() => router.push('/passport')} />
      </RowGroup>
    </View>
  );
}

function UsageRow({ label, used, limit }: { label: string; used: number; limit: number | null }) {
  const t = useT();
  return (
    <View style={{ gap: 6 }}>
      <View style={styles.usageHead}>
        <Text variant="small" style={{ flex: 1 }}>
          {label}
        </Text>
        <Text variant="small" weight="semibold">
          {limit === null ? t('me.usage.unlimited') : t('me.usage.value', { used, limit })}
        </Text>
      </View>
      {limit !== null ? <ProgressBar value={limit > 0 ? used / limit : 0} color={used >= limit ? colors.discuss : colors.primary} /> : null}
    </View>
  );
}

// ───────── Preferences summary ─────────

const IMPORTANCE_RANK = { dealbreaker: 0, must: 1, important: 2, flexible: 3 } as const;

export function PreferencesSummary() {
  const t = useT();
  const locale = useLocale();
  const prefs = useSession((s) => s.preferences);

  const top = prefs
    ? (Object.entries(prefs.dimensionImportance) as Array<[Dimension, keyof typeof IMPORTANCE_RANK]>)
        .filter(([, v]) => v === 'dealbreaker' || v === 'must')
        .sort((a, b) => IMPORTANCE_RANK[a[1]] - IMPORTANCE_RANK[b[1]])
        .map(([d]) => t(`common.dimension.${d}`))
    : [];

  return (
    <Card onPress={() => router.push('/settings/preferences')} accessibilityLabel={t('me.summary.title')}>
      <View style={styles.cardHead}>
        <Icon name="options-outline" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <Text variant="subheading">{t('me.summary.title')}</Text>
          <Text variant="caption" color={colors.textMuted}>
            {t('me.summary.body')}
          </Text>
        </View>
        <Text variant="small" weight="semibold" color={colors.primary}>
          {t('me.summary.edit')}
        </Text>
      </View>
      {prefs ? (
        <View style={{ gap: spacing.xs, marginTop: spacing.md }}>
          <SummaryLine label={t('me.summary.age', { min: prefs.ageMin, max: prefs.ageMax })} />
          <SummaryLine
            label={`${t('me.summary.marital')}: ${
              prefs.maritalStatuses?.length ? listJoin(prefs.maritalStatuses.map((m) => t(`common.marital.${m}`)), locale) : t('me.summary.maritalAny')
            }`}
          />
          <SummaryLine label={prefs.acceptChildren ? t('me.summary.childrenAccept') : t('me.summary.childrenNo')} />
          <SummaryLine label={prefs.verifiedOnly ? t('me.summary.verifiedOnly') : t('me.summary.verifiedOnlyNo')} />
          <SummaryLine
            label={`${t('me.summary.languages')}: ${
              prefs.languages?.length ? listJoin(prefs.languages.map((l) => languageLabel(l, locale)), locale) : t('me.summary.languagesAny')
            }`}
          />
          {top.length ? <SummaryLine label={`${t('me.summary.topValues')}: ${listJoin(top, locale)}`} /> : null}
          <Text variant="caption" color={colors.textSubtle} style={{ marginTop: spacing.xs }}>
            {t('me.summary.cached')}
          </Text>
        </View>
      ) : (
        <Text variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
          {t('me.summary.none')}
        </Text>
      )}
    </Card>
  );
}

function SummaryLine({ label }: { label: string }) {
  return (
    <View style={styles.effect}>
      <View style={styles.dot} />
      <Text variant="small" color={colors.text} style={{ flex: 1 }}>
        {label}
      </Text>
    </View>
  );
}

// ───────── Language ─────────

export function LanguageCard() {
  const t = useT();
  const locale = useLocale();
  const { save, profile } = useSaveProfile();

  const change = async (next: Locale) => {
    if (next === locale) return;
    const reloading = await applyLocale(next);
    if (reloading) {
      useUi.getState().showToast({ message: t('me.language.restarting') });
      return;
    }
    // Let the server know, so notifications arrive in the right language.
    if (profile) void save({});
  };

  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="overline" color={colors.textMuted} style={{ paddingHorizontal: spacing.xs }}>
        {t('me.language.title')}
      </Text>
      <Card>
        <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.sm }}>
          {t('me.language.body')}
        </Text>
        <Segmented<Locale>
          value={locale}
          onChange={(v) => void change(v)}
          options={[
            { value: 'en', label: t('me.language.english') },
            { value: 'ar', label: t('me.language.arabic') },
          ]}
        />
      </Card>
    </View>
  );
}

// ───────── Demo tools (mock mode only) ─────────

export function DemoTools({ me }: { me: MeResponse }) {
  const t = useT();
  const grant = useDevGrant();
  const verify = useVerifyIdentityDemo();
  const { resetDemo } = useAccountActions();
  const [confirm, setConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const identity = me.profile?.verifications.includes('identity') ?? false;

  if (!api.dev) return null;

  const doGrant = (sku: 'plus_monthly' | 'gold_monthly' | 'passport_addon_monthly' | 'passport_pass_7d' | 'free', label: string) =>
    grant.mutate(
      { sku },
      {
        onSuccess: () => useUi.getState().showToast({ message: t('me.demo.granted', { plan: label }), tone: 'success' }),
        onError: () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' }),
      },
    );

  return (
    <View style={{ gap: spacing.sm }}>
      <RowGroup title={t('me.demo.title')}>
        <View style={{ padding: spacing.lg, gap: 4 }}>
          <Text variant="caption" color={colors.textMuted}>
            {t('me.demo.body')}
          </Text>
          <Text variant="caption" color={colors.textSubtle}>
            {t('me.demo.mode')}
          </Text>
        </View>
        <ListRow
          icon={identity ? 'checkmark-circle' : 'finger-print-outline'}
          label={identity ? t('me.demo.verified') : t('me.demo.verify')}
          onPress={identity ? undefined : () => verify.mutate()}
        />
        <ListRow icon="sparkles-outline" label={t('me.demo.grantPlus')} onPress={() => doGrant('plus_monthly', t('common.plan.plus'))} />
        <ListRow icon="diamond-outline" label={t('me.demo.grantGold')} onPress={() => doGrant('gold_monthly', t('common.plan.gold'))} />
        <ListRow icon="airplane-outline" label={t('me.demo.grantAddon')} onPress={() => doGrant('passport_addon_monthly', t('me.plan.passport'))} />
        <ListRow icon="ticket-outline" label={t('me.demo.grantPass')} onPress={() => doGrant('passport_pass_7d', t('me.plan.passport'))} />
        <ListRow icon="arrow-undo-outline" label={t('me.demo.backToFree')} onPress={() => doGrant('free', t('common.plan.free'))} />
        <ListRow icon="trash-outline" danger label={t('me.demo.reset')} onPress={() => setConfirm(true)} />
      </RowGroup>
      <ConfirmSheet
        visible={confirm}
        onClose={() => setConfirm(false)}
        title={t('me.demo.resetTitle')}
        body={t('me.demo.resetBody')}
        confirmLabel={t('me.demo.resetConfirm')}
        danger
        loading={resetting}
        testID="me-reset-sheet"
        onConfirm={() => {
          setResetting(true);
          void resetDemo().finally(() => {
            setResetting(false);
            setConfirm(false);
          });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  summaryTop: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: 2 },
  strength: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  effect: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.primary, marginTop: 8 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  kinds: { gap: spacing.sm, marginTop: spacing.md },
  kindRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  usageHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
