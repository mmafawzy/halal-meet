import { Platform, StyleSheet, View } from 'react-native';

import { Card, Icon, Text, type IconName } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

/** The store that bills this build ("the App Store", "Google Play"). */
export function useStoreName(): string {
  const t = useT();
  return t(`paywall.storeName.${Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web'}`);
}

function Line({ icon, text, color = colors.textMuted }: { icon: IconName; text: string; color?: string }) {
  return (
    <View style={styles.line}>
      <Icon name={icon} size={16} color={colors.primary} />
      <Text variant="small" color={color} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

/** Spec 02 §9.4 / §9.5 — replying, reporting, blocking and verification are never for sale. */
export function SafetyPromise() {
  const t = useT();
  return (
    <Card tone="primary" style={{ gap: spacing.sm }}>
      <Text variant="subheading">{t('paywall.safetyPromise.title')}</Text>
      <Line icon="chatbubble-ellipses-outline" text={t('paywall.safetyPromise.reply')} />
      <Line icon="flag-outline" text={t('paywall.safetyPromise.report')} />
      <Line icon="hand-left-outline" text={t('paywall.safetyPromise.block')} />
      <Line icon="shield-checkmark-outline" text={t('paywall.safetyPromise.verification')} />
      <Line icon="eye-outline" text={t('paywall.safetyPromise.noHiding')} />
    </Card>
  );
}

/** Spec 02 §9.1–3 / §9.10 — what no plan changes. */
export function HonestyBlock() {
  const t = useT();
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="subheading">{t('paywall.honesty.title')}</Text>
      <Line icon="trending-up-outline" text={t('paywall.honesty.noBoosts')} />
      <Line icon="time-outline" text={t('paywall.honesty.noScarcity')} />
      <Line icon="lock-closed-outline" text={t('paywall.honesty.noData')} />
    </View>
  );
}

/** Spec 02 §9.6 — cancelling is two taps, in-app, plus the store link. */
export function CancellationBlock() {
  const t = useT();
  const store = useStoreName();
  return (
    <Card tone="muted" style={{ gap: spacing.sm }}>
      <Text variant="subheading">{t('paywall.cancellation.title')}</Text>
      <Text variant="small" color={colors.textMuted}>
        {t('paywall.cancellation.body')}
      </Text>
      <Line icon="checkmark" text={t('paywall.cancellation.noQuestions')} />
      <Line icon="checkmark" text={t('paywall.cancellation.untilEnd')} />
      <Line icon="checkmark" text={t('paywall.cancellation.storeLink', { store })} />
      <Text variant="bodyStrong" style={{ marginTop: spacing.xs }}>
        {t('paywall.cancellation.afterTitle')}
      </Text>
      <Text variant="small" color={colors.textMuted}>
        {t('paywall.cancellation.afterBody')}
      </Text>
      <Text variant="small" color={colors.textMuted}>
        {t('paywall.cancellation.replyFree')}
      </Text>
    </Card>
  );
}

/** Success stories — only consented ones are ever published, so the honest empty state is shown for now. */
export function StoriesBlock() {
  const t = useT();
  return (
    <View style={{ gap: spacing.xs }}>
      <Text variant="subheading">{t('paywall.stories.title')}</Text>
      <Text variant="small" color={colors.textMuted}>
        {t('paywall.stories.empty')}
      </Text>
      <Text variant="caption" color={colors.textSubtle}>
        {t('paywall.stories.consentNote')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
});
