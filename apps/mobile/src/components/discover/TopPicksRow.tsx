import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { useMe, useTopPicks } from '@/api/hooks';
import { Avatar, Icon, Star, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatTime } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

/** ⭐ Top Picks today — horizontal row pinned above the feed; refreshes daily. */
export function TopPicksRow() {
  const t = useT();
  const locale = useLocale();
  const picks = useTopPicks();
  const me = useMe();
  const hidden = useUi((s) => s.hiddenIds);
  const tier = me.data?.entitlements.tier ?? 'free';
  const cards = (picks.data?.cards ?? []).filter((c) => !hidden[c.id]);

  if (picks.isLoading) return <View style={{ height: 132 }} />;

  return (
    <View style={{ gap: spacing.sm }} testID="top-picks">
      <View style={styles.head}>
        <Star size={14} />
        <Text variant="overline" color={palette.navy700} style={{ flex: 1 }}>
          {t('discover.topPicks.title')}
        </Text>
        {picks.data ? (
          <Text variant="caption" color={colors.textSubtle}>
            {t('discover.topPicks.refresh', { time: formatTime(picks.data.refreshesAt, locale) })}
          </Text>
        ) : null}
      </View>

      {cards.length === 0 ? (
        <View style={styles.empty}>
          <Icon name="moon-outline" size={18} color={palette.gold500} />
          <View style={{ flex: 1 }}>
            <Text variant="small" weight="semibold">
              {t('discover.topPicks.empty')}
            </Text>
            <Text variant="caption" color={colors.textMuted}>
              {t('discover.topPicks.emptyBody')}
            </Text>
          </View>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
          {cards.map((c) => (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityLabel={t('discover.topPicks.open', { name: c.firstName })}
              onPress={() => router.push({ pathname: '/profile/[id]', params: { id: c.id } })}
              style={styles.pick}
              testID={`top-pick-${c.id}`}
            >
              <Avatar id={c.id} name={c.firstName} photoUrl={c.photoUrl} photoState={c.photoState} size={64} ring={palette.gold500} />
              <Text variant="caption" weight="semibold" numberOfLines={1} style={{ maxWidth: 76 }}>
                {c.firstName}
              </Text>
              <Text variant="caption" fontLocale="en" color={colors.primary}>
                {c.compatibility.displayPct}%
              </Text>
            </Pressable>
          ))}
          {tier === 'free' || tier === 'plus' ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('discover.topPicks.upgrade')}
              onPress={() => router.push({ pathname: '/paywall', params: { trigger: 'top_picks' } })}
              style={styles.upgrade}
              testID="top-picks-upgrade"
            >
              <Icon name="sparkles" size={18} color={palette.gold500} />
              <Text variant="caption" weight="semibold" center numberOfLines={3}>
                {t('discover.topPicks.upgrade')}
              </Text>
            </Pressable>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  row: { gap: spacing.md, paddingVertical: spacing.xs, paddingEnd: spacing.md },
  pick: { alignItems: 'center', gap: 2, width: 76 },
  upgrade: {
    width: 96,
    height: 100,
    borderRadius: radii.lg,
    backgroundColor: colors.premiumSoft,
    borderWidth: 1,
    borderColor: '#E9D6A6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    padding: spacing.sm,
  },
  empty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.premiumSoft,
  },
});
