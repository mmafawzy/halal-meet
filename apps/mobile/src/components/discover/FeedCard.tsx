import type { FeedSlot, ProfileCard } from '@halal-meet/core';
import { router } from 'expo-router';
import { memo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HalalModeBadge, PassportBadge, VerificationBadges } from '@/components/profile/Badges';
import { Avatar, Button, Card, CompatRing, Icon, Tag, Text } from '@/components/ui';
import { useLocale, useT, useTs, useViewerGender } from '@/i18n';
import { renderDiscussSafe, renderReason } from '@/lib/compat';
import { placeLabel } from '@/lib/format';
import { colors, palette, radii, spacing } from '@/theme';

export interface FeedCardProps {
  card: ProfileCard;
  slot: FeedSlot;
  busy?: boolean;
  onInterested: (card: ProfileCard) => void;
  onNotForMe: (card: ProfileCard) => void;
}

/** Explained profile card (spec 01 §21): who, where, compatibility and *why*, then two deliberate buttons. */
export const FeedCard = memo(function FeedCard({ card, slot, busy, onInterested, onNotForMe }: FeedCardProps) {
  const t = useT();
  const ts = useTs();
  const locale = useLocale();
  const gender = useViewerGender();
  const c = card.compatibility;
  const serious = slot === 'pinned_serious' || card.sentYouSeriousInterest;
  const reasons = c.reasons.slice(0, 2);
  const discuss = c.discuss[0];
  const open = () => router.push({ pathname: '/profile/[id]', params: { id: card.id } });

  return (
    <View style={styles.wrap} testID={`feed-card-${card.id}`}>
      <Card tone={serious ? 'premium' : 'default'} padded={false}>
        {serious ? (
          <View style={styles.seriousBar}>
            <Text variant="caption" fontLocale="en">
              ⭐
            </Text>
            <Text variant="caption" weight="semibold" color="#8A6A22" style={{ flex: 1 }}>
              {ts('discover.card.seriousAboutYou', card.gender)}
            </Text>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('discover.card.open', { name: card.firstName })}
          onPress={open}
          style={({ pressed }) => [styles.body, pressed && { backgroundColor: 'rgba(15,27,45,0.02)' }]}
        >
          <View style={styles.top}>
            <Avatar id={card.id} name={card.firstName} photoUrl={card.photoUrl} photoState={card.photoState} size={84} shape="rounded" />
            <View style={{ flex: 1, gap: 3 }}>
              <Text variant="heading" numberOfLines={1}>
                {t('matches.nameAge', { name: card.firstName, age: card.age })}
              </Text>
              <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                {placeLabel(card.country, card.city, locale)}
              </Text>
              <VerificationBadges kinds={card.verifications} />
              <View style={styles.tags}>
                <HalalModeBadge mode={card.halalMode} />
                {slot === 'top_pick' ? <Tag label={t('discover.top.mark')} icon="star" tone="gold" /> : null}
                {slot === 'inbound' && !serious ? <Tag label={ts('discover.card.visitedYou', card.gender)} icon="heart" tone="primary" /> : null}
                {card.isNew ? <Tag label={t('common.new')} tone="neutral" /> : null}
              </View>
            </View>
            <CompatRing pct={c.displayPct} size={60} stroke={5} />
          </View>

          {card.passport ? <PassportBadge passport={card.passport} gender={card.gender} /> : null}

          {reasons.length > 0 || discuss ? (
            <View style={styles.reasons}>
              {reasons.map((r, i) => (
                <View key={`${r.questionKey}-${i}`} style={styles.reasonRow}>
                  <Icon name="checkmark-circle" size={16} color={colors.primary} />
                  <Text variant="small" style={{ flex: 1 }} numberOfLines={2}>
                    {renderReason(r, locale, gender)}
                  </Text>
                </View>
              ))}
              {discuss ? (
                <View style={styles.reasonRow}>
                  <Icon name="alert-circle" size={16} color={colors.discuss} />
                  <Text variant="small" color="#9A5E12" style={{ flex: 1 }} numberOfLines={2}>
                    {renderDiscussSafe(discuss, locale, gender).title}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}

          <View style={styles.whyRow}>
            <Text variant="small" weight="semibold" color={colors.primary}>
              {t('discover.card.whyWeMatch')}
            </Text>
            <Icon name="chevron-forward" directional size={14} color={colors.primary} />
          </View>
        </Pressable>

        <View style={styles.actions}>
          <Button
            label={t('discover.card.notForMe')}
            variant="outline"
            icon="close"
            style={{ flex: 1 }}
            disabled={busy}
            onPress={() => onNotForMe(card)}
            testID={`feed-pass-${card.id}`}
          />
          <Button
            label={t('discover.card.interested')}
            icon="heart"
            haptic
            style={{ flex: 1 }}
            disabled={busy}
            onPress={() => onInterested(card)}
            testID={`feed-interested-${card.id}`}
          />
        </View>
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { paddingBottom: spacing.lg },
  seriousBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: palette.gold100,
    borderBottomWidth: 1,
    borderBottomColor: '#E9D6A6',
  },
  body: { padding: spacing.lg, gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 2 },
  reasons: { gap: 6, padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.bgMuted },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  whyRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actions: { flexDirection: 'row', gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
});
