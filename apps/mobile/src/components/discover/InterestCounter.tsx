import { Pressable, StyleSheet, View } from 'react-native';

import { useMe } from '@/api/hooks';
import { Icon, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { timeUntil } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, radii, shadow, spacing } from '@/theme';

/** "♥ 7 of 10 interests left today" — floating pill for plans with a daily limit. */
export function InterestCounter() {
  const t = useT();
  const me = useMe();
  const openLimitSheet = useUi((s) => s.openLimitSheet);
  const usage = me.data?.usage;
  if (!usage || usage.interestsLimit === null) return null;

  const left = Math.max(0, usage.interestsLimit - usage.interestsToday);
  const low = left <= 3;
  const reset = timeUntil(usage.resetsAt);

  return (
    <View style={[styles.wrap, { pointerEvents: 'box-none' }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityHint={t('discover.counter.seeLimit')}
        onPress={() => (left === 0 ? openLimitSheet(null, usage) : undefined)}
        style={[styles.pill, low && { backgroundColor: palette.amber100, borderColor: '#F2D3A6' }]}
        testID="interest-counter"
      >
        <Icon name="heart" size={14} color={low ? colors.discuss : colors.primary} />
        <Text variant="caption" weight="semibold" color={low ? '#9A5E12' : colors.primary}>
          {t(low ? 'discover.counter.leftLow' : 'discover.counter.left', { left, limit: usage.interestsLimit })}
        </Text>
        {left === 0 ? (
          <Text variant="caption" color={colors.textMuted}>
            · {t('discover.counter.resetsIn', { time: t('common.time.hm', { h: reset.h, m: reset.m }) })}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', start: 0, end: 0, bottom: spacing.md, alignItems: 'center' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.primarySoft,
    ...shadow.card,
  },
});
