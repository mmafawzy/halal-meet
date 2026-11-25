import { SKU_PRICES_USD, type Sku } from '@halal-meet/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatPrice } from '@/lib/format';
import { colors, palette, radii, spacing } from '@/theme';

/** Selectable plan (Plus / Gold) with its tagline and monthly price. */
export function PlanCard({
  tier,
  sku,
  selected,
  onPress,
  recommended,
  current,
}: {
  tier: 'plus' | 'gold';
  sku: Extract<Sku, 'plus_monthly' | 'gold_monthly'>;
  selected: boolean;
  onPress: () => void;
  recommended?: boolean;
  current?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const gold = tier === 'gold';
  const price = t('paywall.price.perMonth', { price: formatPrice(SKU_PRICES_USD[sku], locale) });

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected, disabled: current }}
      accessibilityLabel={`${t(`common.plan.${tier}`)}, ${price}`}
      disabled={current}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && (gold ? styles.goldOn : styles.on),
        pressed && !selected && { backgroundColor: palette.sand100 },
        current && { opacity: 0.7 },
      ]}
      testID={`paywall-plan-${tier}`}
    >
      <View style={styles.head}>
        <View style={[styles.icon, gold && { backgroundColor: colors.premiumSoft }]}>
          <Icon name={gold ? 'sparkles' : 'heart-outline'} size={18} color={gold ? '#8A6A22' : colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
            <Text variant="subheading">{t(`common.plan.${tier}`)}</Text>
            {current ? (
              <View style={styles.badge}>
                <Text variant="caption" color={colors.textMuted}>
                  {t('paywall.current')}
                </Text>
              </View>
            ) : recommended ? (
              <View style={[styles.badge, { backgroundColor: gold ? colors.premiumSoft : colors.primaryTint }]}>
                <Text variant="caption" color={gold ? '#8A6A22' : colors.primary}>
                  {t('paywall.recommended')}
                </Text>
              </View>
            ) : null}
          </View>
          <Text variant="small" color={colors.textMuted}>
            {t(`paywall.planTagline.${tier}`)}
          </Text>
        </View>
        <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="checkmark" size={13} color={palette.white} /> : null}</View>
      </View>
      <Text variant="bodyStrong" color={gold ? '#8A6A22' : colors.primary}>
        {price}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  on: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  goldOn: { borderColor: palette.gold500, backgroundColor: colors.premiumSoft },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  badge: { borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 1, backgroundColor: palette.sand100 },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
