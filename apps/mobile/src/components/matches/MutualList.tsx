import type { MatchSummary } from '@halal-meet/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useMatches } from '@/api/hooks';
import { Avatar, Button, Card, EmptyState, ErrorState, Icon, LoadingState, SectionTitle, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatDate, placeLabel } from '@/lib/format';
import { colors, palette, radii, spacing } from '@/theme';

import { StageChip, useRelativeTime } from './shared';

/** Screen 30 — mutual matches (active first). */
export function MutualList() {
  const t = useT();
  const matches = useMatches();

  if (matches.isLoading) return <LoadingState />;
  if (matches.isError) return <ErrorState onRetry={() => void matches.refetch()} />;

  const list = matches.data ?? [];
  const active = list.filter((m) => m.status === 'active');
  const closed = list.filter((m) => m.status === 'closed');

  if (list.length === 0) {
    return (
      <EmptyState
        icon="heart-outline"
        title={t('matches.mutual.empty')}
        body={t('matches.mutual.emptyBody')}
        action={<Button label={t('matches.mutual.emptyAction')} variant="secondary" icon="compass-outline" onPress={() => router.push('/(tabs)/discover')} />}
      />
    );
  }

  return (
    <View style={{ gap: spacing.xl }}>
      {active.length > 0 ? (
        <View>
          <SectionTitle title={t('matches.mutual.active')} />
          <View style={{ gap: spacing.md }}>
            {active.map((m) => (
              <MatchRow key={m.matchId} match={m} />
            ))}
          </View>
        </View>
      ) : null}
      {closed.length > 0 ? (
        <View>
          <SectionTitle title={t('matches.mutual.closed')} />
          <View style={{ gap: spacing.md }}>
            {closed.map((m) => (
              <MatchRow key={m.matchId} match={m} />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function MatchRow({ match }: { match: MatchSummary }) {
  const t = useT();
  const locale = useLocale();
  const rel = useRelativeTime();
  const o = match.other;
  const closed = match.status === 'closed';

  return (
    <Card
      accessibilityLabel={t('matches.mutual.open', { name: o.firstName })}
      onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: match.matchId } })}
      style={closed ? { opacity: 0.7 } : undefined}
    >
      <View style={styles.row}>
        <Avatar id={o.id} name={o.firstName} photoUrl={o.photoUrl} photoState={o.photoState} size={56} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text variant="subheading" numberOfLines={1} style={{ flexShrink: 1 }}>
              {t('matches.nameAge', { name: o.firstName, age: o.age })}
            </Text>
            {match.lastMessage ? (
              <Text variant="caption" color={colors.textSubtle}>
                {rel(match.lastMessage.at)}
              </Text>
            ) : null}
          </View>
          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
            {placeLabel(o.country, o.city, locale)}
          </Text>
          <View style={styles.chips}>
            <StageChip stage={match.stage} muted={closed} />
            {match.yourMove && !closed ? (
              <View style={styles.yourMove}>
                <View style={styles.dot} />
                <Text variant="caption" color={colors.primary}>
                  {t('matches.mutual.yourMove')}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <Icon name="chevron-forward" size={18} color={colors.textSubtle} directional />
      </View>
      {match.firstMessageDue && !closed ? (
        <View style={styles.timer}>
          <Icon name="hourglass-outline" size={14} color="#8A6A22" />
          <Text variant="caption" color="#8A6A22" style={{ flex: 1 }}>
            {t('matches.mutual.salamBy', { date: formatDate(match.firstMessageDue, locale, { weekday: 'long', day: 'numeric', month: 'short' }) })}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  body: { flex: 1, gap: 3 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'space-between' },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: 4, flexWrap: 'wrap' },
  yourMove: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.primary },
  timer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: palette.gold100,
  },
});
