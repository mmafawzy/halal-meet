import { pick, QUESTIONS_BY_KEY, type ProfileCard } from '@halal-meet/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Icon, IconButton, Text } from '@/components/ui';
import { useLocale, usePick, useT, useTs } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

/** Empty-chat starter: "Start with salam" with two tap-to-fill openers. */
export function StarterCard({ other, onPick }: { other: ProfileCard; onPick: (text: string) => void }) {
  const t = useT();
  const ts = useTs();
  const openers = [t('chat.starter.salam', { name: other.firstName }), ts('chat.starter.question', other.gender)];
  return (
    <View style={[styles.card, { backgroundColor: colors.primaryTint, borderColor: colors.primarySoft }]} testID="chat-starter">
      <View style={styles.head}>
        <Icon name="hand-right-outline" size={18} color={colors.primary} />
        <Text variant="subheading" color={colors.text}>
          {t('chat.starter.title')}
        </Text>
      </View>
      <Text variant="small" color={colors.textMuted}>
        {t('chat.starter.hint')}
      </Text>
      {openers.map((o, i) => (
        <Pressable
          key={i}
          testID={`chat-starter-${i}`}
          accessibilityRole="button"
          onPress={() => onPick(o)}
          style={({ pressed }) => [styles.opener, pressed && { backgroundColor: palette.sand100 }]}
        >
          <Text variant="small" style={{ flex: 1 }}>
            {o}
          </Text>
          <Icon name="arrow-forward" size={16} color={colors.primary} directional />
        </Pressable>
      ))}
    </View>
  );
}

/** "Suggested" card (screen 35): the next uncovered core topic, sendable as a topic card. */
export function SuggestionCard({
  topicKey,
  other,
  onSend,
  onDismiss,
  sending,
}: {
  topicKey: string;
  other: ProfileCard;
  onSend: () => void;
  onDismiss: () => void;
  sending: boolean;
}) {
  const t = useT();
  const pickText = usePick();
  const locale = useLocale();
  const q = QUESTIONS_BY_KEY[topicKey];
  if (!q) return null;
  return (
    <View style={[styles.card, { backgroundColor: colors.premiumSoft, borderColor: '#E9D6A6' }]} testID="chat-suggestion">
      <View style={styles.head}>
        <Icon name="bulb-outline" size={18} color="#8A6A22" />
        <Text variant="overline" color="#8A6A22" style={{ flex: 1 }}>
          {t('chat.suggest.title')}
        </Text>
        <IconButton name="close" size={28} accessibilityLabel={t('common.actions.notNow')} onPress={onDismiss} />
      </View>
      <Text variant="small" color={colors.textMuted}>
        {t('chat.suggest.body', { topic: pickText(q.topic) })}
      </Text>
      <Text variant="bodyStrong">
        {locale === 'ar' ? `«${pick(q.text, locale, other.gender)}»` : `“${pick(q.text, locale, other.gender)}”`}
      </Text>
      <View style={styles.actions}>
        <Button testID="chat-suggestion-send" label={t('chat.suggest.send')} size="sm" icon="albums-outline" loading={sending} onPress={onSend} />
        <Button label={t('common.actions.notNow')} size="sm" variant="ghost" onPress={onDismiss} />
      </View>
    </View>
  );
}

/** "Are you ready to proceed?" (screen 39): shown at ≥ 12/15 topics or once stage 4 is complete. */
export function ReadyCard({ onContinue, onFamily, onEnd }: { onContinue: () => void; onFamily: () => void; onEnd: () => void }) {
  const t = useT();
  return (
    <View style={[styles.card, { backgroundColor: palette.white, borderColor: palette.gold300 }]} testID="chat-ready-card">
      <View style={styles.head}>
        <Icon name="ribbon-outline" size={20} color={palette.gold500} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {t('chat.ready.title')}
        </Text>
      </View>
      <Text variant="small" color={colors.textMuted}>
        {t('chat.ready.body')}
      </Text>
      <View style={{ gap: spacing.sm }}>
        <Button label={t('chat.ready.continue')} variant="secondary" fullWidth onPress={onContinue} />
        <Button label={t('chat.ready.family')} icon="people-outline" variant="outline" fullWidth onPress={onFamily} />
        <Button label={t('chat.ready.end')} variant="ghost" fullWidth onPress={onEnd} />
      </View>
    </View>
  );
}

/** Calm notice of the Guided-mode boundaries (photos from stage 3, contact details from stage 4). */
export function GuidedNotice({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  return (
    <View style={styles.guided} testID="chat-guided-notice">
      <Icon name="compass-outline" size={18} color={palette.navy500} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="caption" weight="semibold" color={colors.text}>
          {t('chat.guided.title')}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {t('chat.guided.body')}
        </Text>
      </View>
      <IconButton name="close" size={28} accessibilityLabel={t('common.actions.gotIt')} onPress={onDismiss} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: spacing.sm, padding: spacing.lg, borderRadius: radii.xl, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  opener: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  actions: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  guided: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: palette.sand100,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
});
