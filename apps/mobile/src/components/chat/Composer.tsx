import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Icon, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { colors, fontFamily, MAX_CONTENT_WIDTH, palette, radii, spacing } from '@/theme';

/** Composer: [Topics] [Write a message…] [Send]. Shows the Guided-boundary hint when the draft shares contact details. */
export function Composer({
  value,
  onChange,
  onSend,
  onTopics,
  sending,
  boundaryHint,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  onTopics: () => void;
  sending: boolean;
  boundaryHint: string | null;
}) {
  const t = useT();
  const locale = useLocale();
  const canSend = value.trim().length > 0 && !sending && !boundaryHint;
  return (
    <View style={styles.wrap}>
      {boundaryHint ? (
        <View testID="chat-boundary-hint" style={styles.hint}>
          <Icon name="lock-closed-outline" size={14} color="#9A5E12" />
          <Text variant="caption" color="#9A5E12" style={{ flex: 1 }}>
            {boundaryHint}
          </Text>
        </View>
      ) : null}
      <View style={styles.row}>
        <Pressable
          testID="chat-topics-button"
          accessibilityRole="button"
          accessibilityLabel={t('chat.topics.title')}
          onPress={onTopics}
          style={({ pressed }) => [styles.topics, pressed && { backgroundColor: palette.gold300 }]}
        >
          <Icon name="albums-outline" size={16} color="#8A6A22" />
          <Text variant="caption" weight="semibold" color="#8A6A22">
            {t('chat.topics.button')}
          </Text>
        </Pressable>
        <TextInput
          testID="chat-input"
          value={value}
          onChangeText={onChange}
          placeholder={t('chat.composer.placeholder')}
          placeholderTextColor={colors.textSubtle}
          multiline
          maxLength={2000}
          style={[styles.input, { fontFamily: fontFamily(locale, 'regular'), textAlign: locale === 'ar' ? 'right' : 'left' }]}
          onKeyPress={(e) => {
            // Web: Enter sends, Shift+Enter adds a new line.
            const ne = e.nativeEvent as { key?: string; shiftKey?: boolean };
            if (ne.key === 'Enter' && !ne.shiftKey && canSend) {
              (e as unknown as { preventDefault?: () => void }).preventDefault?.();
              onSend();
            }
          }}
        />
        <Pressable
          testID="chat-send"
          accessibilityRole="button"
          accessibilityLabel={t('chat.composer.send')}
          accessibilityState={{ disabled: !canSend }}
          disabled={!canSend}
          onPress={onSend}
          style={[styles.send, { backgroundColor: canSend ? colors.primary : palette.sand300 }]}
        >
          <Icon name="send" size={18} color={palette.white} directional />
        </Pressable>
      </View>
    </View>
  );
}

/** Read-only footer once the conversation has ended. */
export function ClosedFooter() {
  const t = useT();
  return (
    <View style={[styles.wrap, styles.closed]} testID="chat-closed">
      <Icon name="heart-outline" size={18} color={palette.gold500} />
      <View style={{ flexShrink: 1, gap: 2 }}>
        <Text variant="small" weight="semibold" color={colors.text}>
          {t('chat.closedTitle')}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {t('chat.composer.closed')}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSoft,
  },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm },
  topics: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 42,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.premiumSoft,
  },
  input: {
    flex: 1,
    minHeight: 42,
    maxHeight: 120,
    paddingHorizontal: spacing.md + 2,
    paddingTop: 11,
    paddingBottom: 11,
    borderRadius: 21,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    fontSize: 15,
  },
  send: { width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' },
  hint: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radii.md, backgroundColor: colors.discussSoft },
  closed: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
});
