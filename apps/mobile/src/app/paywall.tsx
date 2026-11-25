import { SKU_PRICES_USD, type PlanTier, type Sku } from '@halal-meet/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useIncoming, useMe } from '@/api/hooks';
import { isSubscription, renewalDateFor, tierForSku, trialRenewsAt, useBilling } from '@/billing';
import { PassportOfferList, passportOffers, type PassportSku } from '@/components/passport/PassportOffers';
import { CompareTable } from '@/components/paywall/CompareTable';
import { PlanCard } from '@/components/paywall/PlanCard';
import { CancellationBlock, HonestyBlock, SafetyPromise, StoriesBlock, useStoreName } from '@/components/paywall/Promises';
import { Button, Card, Header, Icon, LoadingState, Screen, SectionTitle, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatDate, formatPrice } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, spacing } from '@/theme';

const TRIGGERS = ['interests', 'serious', 'top_picks', 'passport', 'incoming', 'undo', 'report', 'default'] as const;
type Trigger = (typeof TRIGGERS)[number];

function asTrigger(v: unknown): Trigger {
  return TRIGGERS.includes(v as Trigger) ? (v as Trigger) : 'default';
}

const RANK: Record<PlanTier, number> = { free: 0, plus: 1, gold: 2, elite: 3 };

/** The option pre-selected for a trigger — the smallest thing that solves what the member was doing. */
function defaultSku(trigger: Trigger, tier: PlanTier, passportChoices: PassportSku[]): Sku | null {
  if (trigger === 'passport' && passportChoices.length > 0) return passportChoices[0]!;
  if (trigger === 'top_picks' && RANK[tier] < RANK.gold) return tier === 'plus' ? 'gold_monthly' : 'plus_monthly';
  if (RANK[tier] < RANK.plus) return 'plus_monthly';
  if (RANK[tier] < RANK.gold) return 'gold_monthly';
  return null;
}

/**
 * Screen 64 / 65 — contextual paywall. Opened with `?trigger=` (interests | serious | top_picks |
 * passport | incoming | undo | report). Shows the specific value for that trigger, the plan
 * comparison built from `PLAN_LIMITS`, honest pricing / trial / renewal / cancellation terms, and
 * buys through `src/billing` (dev grant in mock mode). Never sells safety (spec 02 §9).
 */
export default function PaywallScreen() {
  const t = useT();
  const locale = useLocale();
  const params = useLocalSearchParams<{ trigger?: string }>();
  const trigger = asTrigger(params.trigger);
  const me = useMe();
  const incoming = useIncoming();
  const billing = useBilling();
  const showToast = useUi((s) => s.showToast);
  const store = useStoreName();

  const tier: PlanTier = me.data?.entitlements.tier ?? 'free';
  const ent = me.data?.entitlements.passport;
  const passportChoices = trigger === 'passport' ? passportOffers(tier, ent?.source ?? 'none').filter((s) => s !== 'gold_monthly') : [];

  const [selected, setSelected] = useState<Sku | null>(null);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && me.data) setSelected(defaultSku(trigger, tier, passportChoices));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me.data, trigger, tier, touched]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const header = <Header title={t('paywall.title')} />;

  // ── Safety actions are never upsold: just reassure and send them back. ──
  if (trigger === 'report') {
    return (
      <Screen
        header={header}
        contentStyle={{ gap: spacing.xl }}
        testID="paywall"
        footer={<Button label={t('paywall.trigger.report.reportRedirect')} fullWidth size="lg" onPress={close} testID="paywall-report-back" />}
      >
        <View style={{ gap: spacing.sm, marginTop: spacing.md }}>
          <Text variant="title">{t('paywall.trigger.report.headline')}</Text>
          <Text variant="body" color={colors.textMuted}>
            {t('paywall.trigger.report.body')}
          </Text>
        </View>
        <SafetyPromise />
      </Screen>
    );
  }

  if (me.isLoading) {
    return (
      <Screen header={header}>
        <LoadingState />
      </Screen>
    );
  }

  const select = (sku: Sku) => {
    setTouched(true);
    setSelected(sku);
  };

  const selectedTier: PlanTier | null =
    selected === 'plus_monthly' || selected === 'gold_monthly' ? tierForSku(selected) : null;
  const plans = (['plus', 'gold'] as const).filter((p) => tier !== 'elite' && RANK[p] >= RANK[tier]);
  const showTrial = trigger === 'interests' && tier === 'free' && selected === 'plus_monthly';
  const freePass = !!ent?.freePassAvailable;
  const price = selected ? formatPrice(SKU_PRICES_USD[selected], locale) : '';

  const ctaLabel = (() => {
    if (!selected) return t('paywall.choose');
    if (showTrial) return t('paywall.trial.start');
    if (selected === 'passport_pass_7d' && freePass) return t('passport.purchase.claimFree');
    return t(`paywall.purchase.${selected}`, { price });
  })();

  const buy = async () => {
    if (!selected) return;
    const res = await billing.purchase(selected);
    if (res.status === 'granted') {
      showToast({ message: t('paywall.purchase.done'), tone: 'success', durationMs: 2800 });
      close();
    } else if (res.status !== 'cancelled') {
      showToast({ message: t('paywall.purchase.failed'), tone: 'danger' });
    }
  };

  const restore = async () => {
    const res = await billing.restore();
    showToast({ message: res.changed ? t('paywall.restore.done') : t('paywall.restore.none'), tone: 'neutral' });
  };

  const incomingCount = incoming.data?.count ?? 0;
  const headline = t(`paywall.trigger.${trigger}.headline`, { count: incomingCount });
  const body = t(`paywall.trigger.${trigger}.body`, { count: incomingCount });

  return (
    <Screen
      header={header}
      pattern
      contentStyle={{ gap: spacing.xl }}
      testID="paywall"
      footer={
        <View style={{ gap: spacing.xs }}>
          <Button
            label={ctaLabel}
            size="lg"
            fullWidth
            variant={selected === 'gold_monthly' ? 'gold' : 'primary'}
            disabled={!selected || !billing.available}
            loading={billing.pending}
            onPress={() => void buy()}
            testID="paywall-purchase"
          />
          <Button label={t('paywall.restore.action')} variant="ghost" size="sm" fullWidth onPress={() => void restore()} testID="paywall-restore" />
        </View>
      }
    >
      {/* The specific value for what the member was doing */}
      <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Icon name={trigger === 'passport' ? 'airplane' : 'sparkles'} size={18} color={palette.gold500} />
          <Text variant="overline" color={colors.textMuted}>
            {t('paywall.currentPlan', { plan: t(`common.plan.${tier}`) })}
          </Text>
        </View>
        <Text variant="title" testID="paywall-headline">
          {headline}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {body}
        </Text>
      </View>

      {/* Passport-only options (pass / add-on) when Passport is what they wanted */}
      {passportChoices.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('passport.purchase.title')} />
          <PassportOfferList
            offers={passportChoices}
            selected={selected === 'passport_pass_7d' || selected === 'passport_addon_monthly' ? selected : null}
            onSelect={select}
            freePassAvailable={freePass}
          />
          <Text variant="caption" color={colors.textMuted}>
            {t('passport.afterExpiry')}
          </Text>
        </View>
      ) : null}

      {/* Plans */}
      <View style={{ gap: spacing.sm }}>
        <SectionTitle title={t('paywall.choose')} />
        {tier === 'elite' ? (
          <Card tone="premium">
            <Text variant="bodyStrong">{t('paywall.currentPlan', { plan: t(`common.plan.${tier}`) })}</Text>
            <Text variant="small" color={colors.textMuted}>
              {t(`paywall.planTagline.${tier}`)}
            </Text>
          </Card>
        ) : null}
        {plans.map((p) => {
          const sku = p === 'plus' ? 'plus_monthly' : 'gold_monthly';
          return (
            <PlanCard
              key={p}
              tier={p}
              sku={sku}
              current={tier === p}
              selected={selected === sku}
              recommended={defaultSku(trigger, tier, []) === sku}
              onPress={() => select(sku)}
            />
          );
        })}
        <Text variant="caption" color={colors.textMuted}>
          {t('paywall.compare.freeIncludes')}
        </Text>
      </View>

      {/* Trial — exact dates, one reminder (spec 01 §64, 02 §9.7) */}
      {showTrial ? (
        <Card tone="primary" style={{ gap: spacing.xs }} accessibilityLabel={t('paywall.trial.title')}>
          <Text variant="subheading">{t('paywall.trial.title')}</Text>
          <Text variant="small" color={colors.textMuted}>
            {t('paywall.trial.body')}
          </Text>
          <Text variant="small" weight="semibold">
            {t('paywall.trial.renewsOn', { date: formatDate(trialRenewsAt().toISOString(), locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            {t('paywall.trial.afterTrial', { price: formatPrice(SKU_PRICES_USD.plus_monthly, locale) })}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            {t('paywall.trial.noCharge', { date: formatDate(trialRenewsAt().toISOString(), locale, { day: 'numeric', month: 'long' }) })}
          </Text>
          <Text variant="caption" color={colors.textSubtle}>
            {t('paywall.trial.reminder')}
          </Text>
        </Card>
      ) : null}

      {/* Renewal terms for the selected subscription */}
      {selected && isSubscription(selected) && !showTrial ? (
        <Card tone="muted" style={{ gap: spacing.xs }}>
          <Text variant="bodyStrong">{t('paywall.renewal.title')}</Text>
          <Text variant="small" color={colors.textMuted}>
            {t('paywall.renewal.date', { date: formatDate(renewalDateFor(selected).toISOString(), locale, { day: 'numeric', month: 'long', year: 'numeric' }) })}
            {' · '}
            {t('paywall.price.perMonth', { price })}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            {t('paywall.renewal.body')}
          </Text>
          <Text variant="small" color={colors.textMuted}>
            {t('paywall.renewal.cancelHint')}
          </Text>
        </Card>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <SectionTitle title={t('paywall.compare.title')} />
        <Text variant="small" color={colors.textMuted}>
          {t('paywall.compare.subtitle')}
        </Text>
        <CompareTable trigger={trigger} current={tier} selected={selectedTier} />
      </View>

      <CancellationBlock />
      <SafetyPromise />
      <HonestyBlock />
      <StoriesBlock />

      <View style={{ gap: spacing.xs, marginBottom: spacing.lg }}>
        <Text variant="caption" color={colors.textSubtle}>
          {t('paywall.priceNote')}
        </Text>
        <Text variant="caption" color={colors.textSubtle}>
          {t('paywall.price.store', { store })} · {t('paywall.price.taxes')}
        </Text>
        <Text variant="caption" color={colors.textSubtle}>
          {t('paywall.terms.autoRenew')} {t('paywall.terms.notice')}
        </Text>
        {billing.simulated ? (
          <Text variant="caption" color={colors.textSubtle} testID="paywall-simulated">
            {t('paywall.simulated')}
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
