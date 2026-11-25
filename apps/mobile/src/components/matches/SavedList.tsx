import { PLAN_LIMITS, type ProfileCard } from '@halal-meet/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useMe } from '@/api/hooks';
import { Avatar, Card, EmptyState, Icon, IconButton, ListRow, ProgressBar, RowGroup, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { placeLabel } from '@/lib/format';
import { useLocal } from '@/state/local';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

/** Screen 33 — saved profiles (local bookmarks) + the Plus "Passed (Undo)" entry. */
export function SavedList() {
  const t = useT();
  const me = useMe();
  const saved = useLocal((s) => s.saved);
  const limits = me.data?.entitlements.limits ?? PLAN_LIMITS.free;
  const max = limits.savedProfiles;
  const canUndo = limits.undoPass;

  return (
    <View style={{ gap: spacing.lg }}>
      <View style={styles.info}>
        <Icon name="bookmark" size={16} color={colors.primary} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text variant="small" color={colors.text}>
            {t('matches.saved.hint')}
          </Text>
          {max !== null ? (
            <View style={{ gap: 6 }}>
              <Text variant="caption" color={colors.textMuted}>
                {t('matches.saved.count', { n: saved.length, max })}
              </Text>
              <ProgressBar value={saved.length / max} color={saved.length >= max ? colors.discuss : colors.primary} />
            </View>
          ) : (
            <Text variant="caption" color={colors.textMuted}>
              {t('matches.saved.countUnlimited', { n: saved.length })}
            </Text>
          )}
        </View>
      </View>

      {saved.length === 0 ? (
        <EmptyState icon="bookmark-outline" title={t('matches.saved.empty')} body={t('matches.saved.emptyBody')} />
      ) : (
        <View style={{ gap: spacing.md }}>
          {saved.map((c) => (
            <SavedRow key={c.id} card={c} />
          ))}
        </View>
      )}

      <RowGroup>
        <ListRow
          icon="arrow-undo-outline"
          label={t('matches.saved.passedTitle')}
          description={canUndo ? t('matches.saved.passedSoon') : t('matches.saved.passedBody')}
          onPress={canUndo ? undefined : () => router.push({ pathname: '/paywall', params: { trigger: 'undo' } })}
          right={
            canUndo ? undefined : (
              <View style={styles.plus}>
                <Icon name="sparkles" size={11} color={palette.navy900} />
                <Text variant="caption" color={palette.navy900}>
                  {t('matches.saved.plus')}
                </Text>
              </View>
            )
          }
        />
      </RowGroup>
    </View>
  );
}

function SavedRow({ card }: { card: ProfileCard }) {
  const t = useT();
  const locale = useLocale();
  const unsave = useLocal((s) => s.unsave);
  const save = useLocal((s) => s.save);
  const showToast = useUi((s) => s.showToast);
  return (
    <Card onPress={() => router.push({ pathname: '/profile/[id]', params: { id: card.id } })} accessibilityLabel={card.firstName}>
      <View style={styles.row}>
        <Avatar id={card.id} name={card.firstName} photoUrl={card.photoUrl} photoState={card.photoState} size={52} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="subheading" numberOfLines={1}>
            {t('matches.nameAge', { name: card.firstName, age: card.age })}
          </Text>
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {placeLabel(card.country, card.city, locale)}
          </Text>
        </View>
        <View style={styles.pct}>
          <Text variant="caption" weight="semibold" color={colors.primary}>
            {t('common.compatibleShort', { pct: card.compatibility.displayPct })}
          </Text>
        </View>
        <IconButton
          name="bookmark"
          color={colors.primary}
          bg={colors.primaryTint}
          size={36}
          accessibilityLabel={t('matches.saved.remove', { name: card.firstName })}
          onPress={() => {
            unsave(card.id);
            showToast({
              message: t('matches.saved.removed'),
              actionLabel: t('common.actions.undo'),
              onAction: () => save(card),
              durationMs: 3000,
            });
          }}
        />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  info: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg, borderRadius: radii.xl, backgroundColor: colors.primaryTint },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pct: { paddingHorizontal: spacing.sm, paddingVertical: 3, borderRadius: radii.pill, backgroundColor: colors.primaryTint },
  plus: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, backgroundColor: palette.gold500 },
});
