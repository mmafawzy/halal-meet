import type { MatchSummary } from '@halal-meet/core';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { StageChip, TopicRing, useRelativeTime } from '@/components/matches/shared';
import { Avatar, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, palette, spacing } from '@/theme';

/** Inbox row (screen 34): avatar, name, journey chip, topic coverage ring, last message preview. */
export function ConversationRow({ match }: { match: MatchSummary }) {
  const t = useT();
  const rel = useRelativeTime();
  const o = match.other;
  const closed = match.status === 'closed';
  const unread = match.yourMove && !closed && !!match.lastMessage;
  const preview = match.lastMessage
    ? match.lastMessage.fromMe
      ? t('chat.inbox.you', { text: match.lastMessage.body })
      : match.lastMessage.body
    : t('chat.inbox.noMessages');

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={o.firstName}
      onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId: match.matchId } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sand100 }, closed && { opacity: 0.65 }]}
    >
      <View>
        <Avatar id={o.id} name={o.firstName} photoUrl={o.photoUrl} photoState={o.photoState} size={54} />
        {unread ? <View style={styles.unreadDot} /> : null}
      </View>
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text variant="subheading" numberOfLines={1} style={{ flexShrink: 1 }}>
            {o.firstName}
          </Text>
          {match.lastMessage ? (
            <Text variant="caption" color={unread ? colors.primary : colors.textSubtle}>
              {rel(match.lastMessage.at)}
            </Text>
          ) : null}
        </View>
        <StageChip stage={match.stage} muted={closed} />
        <Text
          variant="small"
          numberOfLines={1}
          color={unread ? colors.text : colors.textMuted}
          weight={unread ? 'semibold' : undefined}
          style={!match.lastMessage ? { fontStyle: 'italic' } : undefined}
        >
          {preview}
        </Text>
      </View>
      <View style={styles.ring} accessibilityLabel={t('chat.inbox.topics', { n: match.topicsCovered, total: match.topicsTotal })}>
        <TopicRing covered={match.topicsCovered} total={match.topicsTotal} color={closed ? palette.navy300 : colors.primary} />
        <Text variant="caption" color={colors.textSubtle} style={{ fontSize: 10, lineHeight: 13 }} fontLocale="en">
          {match.topicsCovered}/{match.topicsTotal}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2 },
  body: { flex: 1, gap: 5 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  unreadDot: {
    position: 'absolute',
    top: 0,
    end: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: palette.white,
  },
  ring: { alignItems: 'center', gap: 2 },
});
