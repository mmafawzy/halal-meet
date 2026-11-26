import { SKU_PRICES_USD, type PlanTier, type Sku } from '@halal-meet/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMe } from '@/api/hooks';
import { useBilling } from '@/billing';
import { useStoreName } from '@/components/paywall/Promises';
import { Button, Icon, Sheet, Text, type IconName } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatPrice } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

import { LOW_COUNT_WARNING } from './dates';

export type PassportSku = Extract<Sku, 'passport_pass_7d' | 'passport_addon_monthly' | 'gold_monthly'>;

const ICONS: Record<PassportSku, IconName> = {
  passport_pass_7d: 'airplane-outline',
  passport_addon_monthly: 'repeat',
  gold_monthly: 'sparkles',
};

/** Which Passport offers make sense for this member (no point offering the add-on to someone who has it). */
export function passportOffers(tier: PlanTier, source: 'none' | 'pass' | 'addon' | 'plan'): PassportSku[] {
  if (tier === 'gold' || tier === 'elite' || source === 'plan') return [];
  const list: PassportSku[] = [];
  if (source !== 'addon') list.push('passport_pass_7d', 'passport_addon_monthly');
  list.push('gold_monthly');
  return list;
}

/** The three Passport options of spec 01 §73 as selectable cards (also used on the paywall). */
export function PassportOfferList({
  offers,
  selected,
  onSelect,
  freePassAvailable,
  priceOf,
}: {
  offers: PassportSku[];
  selected: PassportSku | null;
  onSelect: (sku: PassportSku) => void;
  freePassAvailable: boolean;
  /** Localised store price when known (defaults to the US reference price). */
  priceOf?: (sku: PassportSku) => string;
}) {
  const t = useT();
  const locale = useLocale();

  const copy = (sku: PassportSku) => {
    const price = priceOf ? priceOf(sku) : formatPrice(SKU_PRICES_USD[sku], locale);
    switch (sku) {
      case 'passport_pass_7d':
        return freePassAvailable
          ? { title: t('passport.purchase.pass.title'), body: t('passport.purchase.pass.freeBody'), price: t('passport.purchase.pass.free'), note: null }
          : { title: t('passport.purchase.pass.title'), body: t('passport.purchase.pass.body'), price: t('passport.purchase.once', { price }), note: null };
      case 'passport_addon_monthly':
        return { title: t('passport.purchase.addon.title'), body: t('passport.purchase.addon.body'), price: t('passport.purchase.perMonth', { price }), note: null };
      case 'gold_monthly':
        return {
          title: t('passport.purchase.gold.title'),
          body: t('passport.purchase.gold.body'),
          price: t('passport.purchase.perMonth', { price }),
          note: t('passport.purchase.gold.better'),
        };
    }
  };

  return (
    <View style={{ gap: spacing.sm }}>
      {offers.map((sku) => {
        const c = copy(sku);
        const on = selected === sku;
        const gold = sku === 'gold_monthly';
        return (
          <Pressable
            key={sku}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={`${c.title}, ${c.price}`}
            onPress={() => onSelect(sku)}
            style={({ pressed }) => [styles.offer, on && (gold ? styles.offerGold : styles.offerOn), pressed && !on && { backgroundColor: palette.sand100 }]}
            testID={`passport-offer-${sku}`}
          >
            <View style={[styles.icon, gold && { backgroundColor: colors.premiumSoft }]}>
              <Icon name={ICONS[sku]} size={18} color={gold ? '#8A6A22' : colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.head}>
                <Text variant="bodyStrong" style={{ flexShrink: 1 }}>
                  {c.title}
                </Text>
                <Text variant="small" weight="semibold" color={gold ? '#8A6A22' : colors.primary}>
                  {c.price}
                </Text>
              </View>
              <Text variant="small" color={colors.textMuted}>
                {c.body}
              </Text>
              {c.note ? (
                <Text variant="caption" color="#8A6A22">
                  {c.note}
                </Text>
              ) : null}
            </View>
            <View style={[styles.radio, on && styles.radioOn]}>{on ? <Icon name="checkmark" size={13} color={palette.white} /> : null}</View>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Screen 73 — Passport purchase sheet. Shows the live count for the chosen destination, warns when it is
 * small, and buys through `src/billing` (dev grant in mock mode). Resolves through `onPurchased`.
 */
export function PassportPurchaseSheet({
  visible,
  onClose,
  onPurchased,
  count,
  place,
}: {
  visible: boolean;
  onClose: () => void;
  onPurchased?: (sku: PassportSku) => void;
  /** Live compatible count for the chosen destination, if known. */
  count?: number | null;
  place?: string | null;
}) {
  const t = useT();
  const locale = useLocale();
  const me = useMe();
  const billing = useBilling();
  const showToast = useUi((s) => s.showToast);
  const storeName = useStoreName();

  const tier = me.data?.entitlements.tier ?? 'free';
  const ent = me.data?.entitlements.passport;
  const freePass = !!ent?.freePassAvailable;
  const offers = passportOffers(tier, ent?.source ?? 'none');
  const [selected, setSelected] = useState<PassportSku | null>(offers[0] ?? null);

  useEffect(() => {
    if (visible && (!selected || !offers.includes(selected))) setSelected(offers[0] ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, offers.join()]);

  const ctaLabel = (() => {
    if (!selected) return t('common.actions.continue');
    const price = billing.priceOf(selected);
    if (selected === 'passport_pass_7d') return freePass ? t('passport.purchase.claimFree') : t('passport.purchase.buy', { price });
    return t('passport.purchase.buyMonthly', { price });
  })();

  const unavailableCopy = billing.unavailableReason === 'web' ? t('paywall.billing.unavailableWeb') : t('paywall.billing.unavailableConfig');

  const buy = async () => {
    if (!selected) return;
    const res = await billing.purchase(selected);
    if (res.status === 'granted') {
      showToast({ message: t('passport.purchase.done'), tone: 'success' });
      onClose();
      onPurchased?.(selected);
    } else if (res.status === 'pending') {
      showToast({ message: t('paywall.billing.pending'), tone: 'neutral', durationMs: 4000 });
    } else if (res.status === 'unavailable') {
      showToast({ message: unavailableCopy, tone: 'neutral' });
    } else if (res.status === 'error') {
      showToast({ message: t('passport.purchase.failed'), tone: 'danger' });
    }
    // 'cancelled': the member changed their mind — nothing to say.
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('passport.purchase.title')}
      subtitle={t('passport.purchase.subtitle')}
      testID="passport-purchase-sheet"
      footer={
        <View style={{ gap: spacing.xs }}>
          <Button
            label={ctaLabel}
            variant={selected === 'gold_monthly' ? 'gold' : 'primary'}
            fullWidth
            loading={billing.pending}
            disabled={!selected || !billing.available}
            onPress={() => void buy()}
            testID="passport-purchase-cta"
          />
          <Button
            label={t('passport.purchase.compare')}
            variant="ghost"
            fullWidth
            onPress={() => {
              onClose();
              router.push({ pathname: '/paywall', params: { trigger: 'passport' } });
            }}
          />
        </View>
      }
    >
      {place && typeof count === 'number' ? (
        <View style={styles.count}>
          <Icon name="people-outline" size={18} color={colors.primary} />
          <Text variant="small" weight="medium" style={{ flex: 1 }}>
            {t('passport.activate.count', { count, place })}
          </Text>
        </View>
      ) : null}
      {place && typeof count === 'number' && count < LOW_COUNT_WARNING ? (
        <View style={styles.warn}>
          <Icon name="information-circle-outline" size={18} color="#9A5E12" />
          <Text variant="small" color="#9A5E12" style={{ flex: 1 }}>
            {t('passport.activate.lowCount', { count })}
          </Text>
        </View>
      ) : null}

      <PassportOfferList offers={offers} selected={selected} onSelect={setSelected} freePassAvailable={freePass} priceOf={billing.priceOf} />

      <Text variant="caption" color={colors.textMuted}>
        {t('passport.afterExpiry')}
      </Text>
      <Text variant="caption" color={colors.textSubtle}>
        {billing.storePricing ? t('paywall.billing.priceFromStore', { store: storeName }) : `${t('paywall.priceNote')} ${t('paywall.billing.priceAtCheckout')}`}
      </Text>
      {!billing.available ? (
        <Text variant="small" color={colors.textMuted} testID="passport-purchase-unavailable">
          {unavailableCopy}
        </Text>
      ) : null}
      {billing.simulated ? (
        <Text variant="caption" color={colors.textSubtle}>
          {t('passport.purchase.simulated')}
        </Text>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  offer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  offerOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  offerGold: { borderColor: palette.gold500, backgroundColor: colors.premiumSoft },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  count: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.primaryTint },
  warn: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.discussSoft },
});
