import type { MatchSummary } from '@halal-meet/core';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Icon, IconButton, Tag, Text } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { colors, MAX_CONTENT_WIDTH, palette, spacing } from '@/theme';

import { presenceLines } from './GuardianPresence';

/**
 * Chat header (screen 35): back · avatar · name + ID badge · Halal Mode · more. Below it, one line per active
 * guardian on either side, from `match.guardians` (always visible to both people).
 */
export function ChatHeader({ match, onMore }: { match: MatchSummary; onMore: () => void }) {
  const t = useT();
  const ts = useTs();
  const o = match.other;
  const verified = o.verifications.includes('identity');
  const lines = presenceLines(match, t, ts);

  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <IconButton
          name="chevron-back"
          directional
          accessibilityLabel={t('common.actions.back')}
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/conversations'))}
        />
        <Pressable
          testID="chat-header-profile"
          accessibilityRole="button"
          accessibilityLabel={t('chat.header.viewProfile')}
          onPress={() => router.push({ pathname: '/profile/[id]', params: { id: o.id } })}
          style={styles.identity}
        >
          <Avatar id={o.id} name={o.firstName} photoUrl={o.photoUrl} photoState={o.photoState} size={40} />
          <View style={{ flex: 1, gap: 2 }}>
            <View style={styles.nameRow}>
              <Text variant="subheading" numberOfLines={1} style={{ flexShrink: 1 }}>
                {o.firstName}
              </Text>
              {verified ? (
                <View accessibilityLabel={t('common.verification.identity')}>
                  <Icon name="shield-checkmark" size={16} color={palette.blue600} />
                </View>
              ) : null}
            </View>
            <Tag
              icon="leaf-outline"
              tone="neutral"
              label={t(`common.halalModeShort.${o.halalMode}`)}
              style={{ alignSelf: 'flex-start' }}
            />
          </View>
        </Pressable>
        <View testID="chat-more">
          <IconButton name="ellipsis-vertical" accessibilityLabel={t('chat.header.more')} onPress={onMore} />
        </View>
      </View>
      {lines.length > 0 ? (
        <View
          style={styles.guardian}
          testID="chat-guardian-presence"
          accessible
          accessibilityLabel={`${lines.map((l) => l.text).join(' ')} ${t('chat.header.guardian')}`}
        >
          <Icon name="people-outline" size={15} color={palette.navy500} />
          <View style={{ flex: 1 }}>
            {lines.map((l) => (
              <Text key={l.key} variant="caption" color={colors.textMuted} testID={`chat-guardian-${l.key}`}>
                {l.text}
              </Text>
            ))}
            <Text variant="caption" color={colors.textSubtle} style={{ fontSize: 11 }}>
              {t('chat.header.guardian')}
            </Text>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, gap: spacing.xs },
  identity: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  guardian: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: 12,
    backgroundColor: palette.sand100,
  },
});
