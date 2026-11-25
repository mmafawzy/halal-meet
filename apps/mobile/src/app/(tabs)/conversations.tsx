import type { MatchSummary } from '@halal-meet/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useMatches } from '@/api/hooks';
import { ConversationRow } from '@/components/chat/ConversationRow';
import { Button, EmptyState, ErrorState, Icon, LoadingState, RowGroup, Screen, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

/** Screen 34 — Conversations inbox: Your move · Their move · Family rooms (soon) · Closed. */
export default function ConversationsScreen() {
  const t = useT();
  const matches = useMatches({ poll: true });

  const list = matches.data ?? [];
  const yourMove = list.filter((m) => m.status === 'active' && m.yourMove);
  const theirMove = list.filter((m) => m.status === 'active' && !m.yourMove);
  const closed = list.filter((m) => m.status === 'closed');

  return (
    <Screen edges={['top']} pattern>
      <View style={{ gap: 2, marginBottom: spacing.xl, marginTop: spacing.sm }}>
        <Text variant="title">{t('chat.inbox.title')}</Text>
        <Text variant="small" color={colors.textMuted}>
          {t('chat.inbox.subtitle')}
        </Text>
      </View>

      {matches.isLoading ? (
        <LoadingState />
      ) : matches.isError ? (
        <ErrorState onRetry={() => void matches.refetch()} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="chatbubbles-outline"
          title={t('chat.inbox.empty')}
          body={t('chat.inbox.emptyBody')}
          action={
            <Button label={t('chat.inbox.emptyAction')} variant="secondary" icon="compass-outline" onPress={() => router.push('/(tabs)/discover')} />
          }
        />
      ) : (
        <View style={{ gap: spacing.xl }}>
          <Section title={t('chat.inbox.yourMove')} hint={yourMove.length > 0 ? t('chat.inbox.yourMoveHint') : undefined} items={yourMove} />
          <Section title={t('chat.inbox.theirMove')} items={theirMove} />
          <View style={styles.family}>
            <View style={styles.familyIcon}>
              <Icon name="people-outline" size={18} color={palette.navy500} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="bodyStrong" color={colors.textMuted}>
                {t('chat.inbox.familyRooms')}
              </Text>
              <Text variant="caption" color={colors.textSubtle}>
                {t('chat.inbox.familyRoomsBody')}
              </Text>
            </View>
            <View style={styles.soon}>
              <Text variant="caption" color={palette.navy500}>
                {t('chat.inbox.soon')}
              </Text>
            </View>
          </View>
          <Section title={t('chat.inbox.closed')} items={closed} />
        </View>
      )}
    </Screen>
  );
}

function Section({ title, items, hint }: { title: string; items: MatchSummary[]; hint?: string }) {
  if (items.length === 0) return null;
  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.sectionHead}>
        <Text variant="overline" color={colors.textMuted}>
          {title}
        </Text>
        <View style={styles.count}>
          <Text variant="caption" color={colors.textMuted} fontLocale="en" style={{ fontSize: 10, lineHeight: 13 }}>
            {items.length}
          </Text>
        </View>
      </View>
      {hint ? (
        <Text variant="caption" color={colors.textSubtle} style={{ paddingHorizontal: spacing.xs }}>
          {hint}
        </Text>
      ) : null}
      <RowGroup>
        {items.map((m) => (
          <ConversationRow key={m.matchId} match={m} />
        ))}
      </RowGroup>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs },
  count: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: palette.sand200, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 5 },
  family: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.bgMuted,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    borderStyle: 'dashed',
  },
  familyIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: palette.sand200, alignItems: 'center', justifyContent: 'center' },
  soon: { paddingHorizontal: spacing.sm, paddingVertical: 2, borderRadius: radii.pill, backgroundColor: palette.sand200 },
});
