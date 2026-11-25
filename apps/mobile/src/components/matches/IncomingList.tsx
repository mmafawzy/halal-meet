import type { IncomingInterestsResponse } from '@halal-meet/core';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useIncoming, useMe, usePass, useSendInterest } from '@/api/hooks';
import { Avatar, Button, Card, CompatRing, EmptyState, ErrorState, Icon, LoadingState, Text } from '@/components/ui';
import { useLocale, useT, useTs } from '@/i18n';
import { placeLabel } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

type IncomingCard = IncomingInterestsResponse['cards'][number];

/** Screen 31 — "Interested in you". Free users see counts + blurred placeholders; serious interests are always shown. */
export function IncomingList() {
  const t = useT();
  const me = useMe();
  const incoming = useIncoming();

  if (incoming.isLoading || me.isLoading) return <LoadingState />;
  if (incoming.isError || !incoming.data) return <ErrorState onRetry={() => void incoming.refetch()} />;

  const { count, highCompatCount, cards } = incoming.data;
  const free = (me.data?.entitlements.limits.incomingInterests ?? 'count') === 'count';

  if (count === 0) {
    return <EmptyState icon="sparkles-outline" title={t('matches.incoming.empty')} body={t('matches.incoming.emptyBody')} />;
  }

  // Serious interests first.
  const sorted = [...cards].sort((a, b) => (a.level === b.level ? 0 : a.level === 'serious' ? -1 : 1));
  const hiddenCount = free ? Math.max(0, count - cards.length) : 0;
  const visibleHigh = cards.filter((c) => c.compatibility.displayPct >= 85).length;
  const hiddenHigh = Math.min(hiddenCount, Math.max(0, highCompatCount - visibleHigh));

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.headline}>
        <View style={styles.headIcon}>
          <Icon name="heart" size={18} color={colors.primary} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading">
            {count === 1 ? t('matches.incoming.headlineOne') : t('matches.incoming.headline', { count })}
          </Text>
          {highCompatCount > 0 && count > 1 ? (
            <Text variant="small" color={colors.textMuted}>
              {t('matches.incoming.highCompat', { count: highCompatCount })}
            </Text>
          ) : null}
        </View>
      </View>

      {sorted.map((c) => (
        <InterestCard key={c.id} card={c} />
      ))}

      {hiddenCount > 0 ? (
        <>
          {Array.from({ length: hiddenCount }, (_, i) => (
            <LockedInterestCard key={`locked-${i}`} high={i < hiddenHigh} index={i} />
          ))}
          <View style={{ gap: spacing.md, marginTop: spacing.xs }}>
            <Button
              label={t('matches.incoming.unlock')}
              variant="gold"
              icon="sparkles"
              fullWidth
              onPress={() => router.push({ pathname: '/paywall', params: { trigger: 'incoming' } })}
            />
            <View style={styles.boosted}>
              <Icon name="trending-up-outline" size={16} color={colors.primary} />
              <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                {t('matches.incoming.boosted')}
              </Text>
            </View>
          </View>
        </>
      ) : null}
    </View>
  );
}

function InterestCard({ card }: { card: IncomingCard }) {
  const t = useT();
  const ts = useTs();
  const locale = useLocale();
  const pass = usePass();
  const send = useSendInterest();
  const showToast = useUi((s) => s.showToast);
  const serious = card.level === 'serious';
  const busy = pass.isPending || send.isPending;

  return (
    <Card tone={serious ? 'premium' : 'default'} onPress={() => router.push({ pathname: '/profile/[id]', params: { id: card.id } })} accessibilityLabel={card.firstName}>
      {serious ? (
        <View style={styles.seriousRow}>
          <Text variant="caption" fontLocale="en">
            ⭐
          </Text>
          <Text variant="caption" weight="semibold" color="#8A6A22" style={{ flex: 1 }}>
            {ts('matches.incoming.serious', card.gender)}
          </Text>
        </View>
      ) : null}
      <View style={styles.cardRow}>
        <Avatar id={card.id} name={card.firstName} photoUrl={card.photoUrl} photoState={card.photoState} size={60} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading" numberOfLines={1}>
            {t('matches.nameAge', { name: card.firstName, age: card.age })}
          </Text>
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {placeLabel(card.country, card.city, locale)}
          </Text>
          {card.profession ? (
            <Text variant="caption" color={colors.textSubtle} numberOfLines={1}>
              {card.profession}
            </Text>
          ) : null}
        </View>
        <CompatRing pct={card.compatibility.displayPct} size={54} stroke={5} />
      </View>
      {card.note ? (
        <View style={[styles.note, serious && { backgroundColor: palette.white }]}>
          <Text variant="overline" color={colors.textMuted}>
            {ts('matches.incoming.note', card.gender)}
          </Text>
          <Text variant="body" style={{ fontStyle: 'italic' }}>
            “{card.note}”
          </Text>
        </View>
      ) : null}
      <View style={styles.actions}>
        <Button
          label={t('matches.incoming.notForMe')}
          variant="outline"
          size="sm"
          style={{ flex: 1 }}
          disabled={busy}
          loading={pass.isPending}
          onPress={() =>
            pass.mutate(
              { toId: card.id },
              { onSuccess: () => showToast({ message: t('common.undo.passed'), durationMs: 2200 }) },
            )
          }
        />
        <Button
          label={t('matches.incoming.accept')}
          variant="primary"
          size="sm"
          icon="heart"
          style={{ flex: 1 }}
          disabled={busy}
          loading={send.isPending}
          haptic
          onPress={() => send.mutate({ body: { toId: card.id, level: 'interest' }, card })}
        />
      </View>
    </Card>
  );
}

const LOCKED_GRADIENTS: Array<[string, string]> = [
  [palette.emerald50, palette.sand200],
  [palette.gold100, palette.ivory100],
  ['#E9ECF2', palette.sand100],
];

/** Honest blurred placeholder: we only know whether the person is in the 85%+ group. */
function LockedInterestCard({ high, index }: { high: boolean; index: number }) {
  const t = useT();
  const g = LOCKED_GRADIENTS[index % LOCKED_GRADIENTS.length]!;
  return (
    <Card padded={false} accessibilityLabel={t('matches.incoming.hidden')}>
      <LinearGradient colors={g} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.locked}>
        <View style={styles.lockedAvatar}>
          <Icon name="lock-closed" size={20} color={palette.navy500} />
        </View>
        <View style={{ flex: 1, gap: spacing.sm }}>
          <View style={[styles.skeleton, { width: '55%' }]} />
          <View style={[styles.skeleton, { width: '35%', opacity: 0.6 }]} />
          <Text variant="caption" color={colors.textMuted}>
            {t('matches.incoming.hidden')}
          </Text>
        </View>
        <View style={{ alignItems: 'center', gap: 2 }}>
          <View style={[styles.lockedRing, high && { borderColor: colors.primary }]}>
            <Text fontLocale={high ? undefined : 'en'} weight="bold" color={high ? colors.primary : colors.textSubtle} style={{ fontSize: 13 }}>
              {high ? t('matches.incoming.highBadge') : t('matches.incoming.unknownBadge')}
            </Text>
          </View>
          <Text variant="caption" color={colors.textSubtle} style={{ fontSize: 10 }}>
            {t('matches.incoming.compatLabel')}
          </Text>
        </View>
      </LinearGradient>
    </Card>
  );
}

const styles = StyleSheet.create({
  headline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.primaryTint,
  },
  headIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  seriousRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.md },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  note: { marginTop: spacing.md, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.bgMuted, gap: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  boosted: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingHorizontal: spacing.xs },
  locked: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  lockedAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeleton: { height: 10, borderRadius: 5, backgroundColor: 'rgba(15,27,45,0.12)' },
  lockedRing: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 4,
    borderColor: palette.sand300,
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
