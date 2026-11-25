import { CORE_TOPIC_KEYS, pick, QUESTIONS_BY_KEY, type Gender } from '@halal-meet/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, Sheet, Text, type IconName } from '@/components/ui';
import { useLocale, usePick, useT } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

import type { TopicState } from './topics';

const STATE_ICON: Record<TopicState, { icon: IconName; color: string }> = {
  covered: { icon: 'checkmark-circle', color: colors.primary },
  differs: { icon: 'alert-circle', color: colors.discuss },
  pending: { icon: 'hourglass-outline', color: palette.navy500 },
  none: { icon: 'ellipse-outline', color: palette.navy300 },
};

const STATE_LABEL: Record<TopicState, string> = {
  covered: 'chat.topics.covered',
  differs: 'chat.topics.differs',
  pending: 'chat.topics.pending',
  none: 'chat.topics.notYet',
};

/** Topic library (screen 36): the 15 core topics with ✓ / ⚠ / ○ state; tap an open one to send it as a topic card. */
export function TopicLibrarySheet({
  visible,
  onClose,
  states,
  otherGender,
  canSend,
  onSend,
}: {
  visible: boolean;
  onClose: () => void;
  states: Record<string, TopicState>;
  otherGender: Gender;
  canSend: boolean;
  onSend: (topicKey: string) => void;
}) {
  const t = useT();
  const pickText = usePick();
  const locale = useLocale();
  return (
    <Sheet visible={visible} onClose={onClose} title={t('chat.topics.title')} subtitle={t('chat.topics.subtitle')} testID="chat-topic-library">
      <View style={{ gap: spacing.sm }}>
        {CORE_TOPIC_KEYS.map((k) => {
          const q = QUESTIONS_BY_KEY[k];
          if (!q) return null;
          const st = states[k] ?? 'none';
          const sendable = canSend && st === 'none';
          return (
            <Pressable
              key={k}
              testID={`chat-topic-${k}`}
              accessibilityRole={sendable ? 'button' : undefined}
              accessibilityLabel={`${pickText(q.topic)} · ${t(STATE_LABEL[st])}`}
              disabled={!sendable}
              onPress={() => onSend(k)}
              style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sand100 }]}
            >
              <Icon name={STATE_ICON[st].icon} size={20} color={STATE_ICON[st].color} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{pickText(q.topic)}</Text>
                <Text variant="caption" color={colors.textMuted} numberOfLines={2}>
                  {pick(q.text, locale, otherGender)}
                </Text>
                <Text variant="caption" color={STATE_ICON[st].color}>
                  {t(STATE_LABEL[st])}
                </Text>
              </View>
              {sendable ? (
                <View style={styles.send}>
                  <Icon name="send" size={14} color={colors.primary} directional />
                </View>
              ) : null}
            </Pressable>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  send: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
});
