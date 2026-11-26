import type { BillingSubscriptionView } from '@halal-meet/core';
import { View } from 'react-native';

import { useBilling } from '@/billing';
import { Button, Card, Icon, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

/** Store value from GET /me/billing → the store's display name. */
function useStoreLabel() {
  const t = useT();
  return (store: string) =>
    store === 'apple' ? t('paywall.storeName.ios') : store === 'google' ? t('paywall.storeName.android') : t('paywall.storeName.web');
}

/**
 * "Your subscription": current plan / add-on with the exact renewal (or end) date, the store that bills it,
 * billing-issue notice, live passes, and the two-tap path to manage or cancel (spec 02 §9.6). Hidden when the
 * member has nothing.
 */
export function SubscriptionStatus() {
  const t = useT();
  const locale = useLocale();
  const billing = useBilling();
  const showToast = useUi((s) => s.showToast);
  const storeLabel = useStoreLabel();
  const details = billing.details;
  if (!details || (details.subscriptions.length === 0 && details.passes.length === 0)) return null;

  const date = (iso: string) => formatDate(iso, locale, { day: 'numeric', month: 'long', year: 'numeric' });
  const simulatedOnly = details.subscriptions.every((s) => !s.managementUrl);

  const manage = async () => {
    const opened = await billing.manage();
    if (!opened) showToast({ message: billing.simulated ? t('paywall.billing.demo') : t('paywall.billing.manageNone'), tone: 'neutral' });
  };

  const row = (s: BillingSubscriptionView) => (
    <View key={s.id} style={{ gap: 2 }} testID={`subscription-${s.tier}`}>
      <Text variant="bodyStrong">
        {t(`paywall.billing.plan.${s.tier}`)}
        {s.managementUrl ? ` · ${t('paywall.price.store', { store: storeLabel(s.store) })}` : ''}
      </Text>
      <Text variant="small" color={colors.textMuted}>
        {s.autoRenew ? t('paywall.billing.renewsOn', { date: date(s.currentPeriodEnd) }) : t('paywall.billing.endsOn', { date: date(s.currentPeriodEnd) })}
      </Text>
      {s.billingIssue ? (
        <View style={{ flexDirection: 'row', gap: spacing.xs, alignItems: 'flex-start' }}>
          <Icon name="information-circle-outline" size={16} color="#9A5E12" />
          <Text variant="small" color="#9A5E12" style={{ flex: 1 }}>
            {t('paywall.billing.billingIssue')}
          </Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <Card tone="muted" style={{ gap: spacing.sm }}>
      <Text variant="subheading">{t('paywall.billing.yourSubscription')}</Text>
      {details.subscriptions.map(row)}
      {details.passes.map((p) => (
        <Text key={p.id} variant="small" color={colors.textMuted}>
          {t('paywall.billing.passUntil', { date: date(p.expiresAt) })}
          {p.free ? ` · ${t('paywall.billing.freePass')}` : ''}
        </Text>
      ))}
      {details.subscriptions.length > 0 ? (
        <>
          {simulatedOnly && billing.simulated ? (
            <Text variant="caption" color={colors.textSubtle}>
              {t('paywall.billing.demo')}
            </Text>
          ) : null}
          <Button label={t('paywall.manageSubscription.action')} variant="secondary" size="sm" fullWidth onPress={() => void manage()} testID="paywall-manage" />
        </>
      ) : null}
    </Card>
  );
}
