import type { ProfileCard } from '@halal-meet/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useCloseMatch } from '@/api/hooks';
import { Button, Chip, ChipRow, Field, Icon, Sheet, Text, TextField } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, palette, spacing } from '@/theme';

const REASONS = ['values', 'religion', 'family', 'location', 'timeline', 'feeling', 'other'] as const;
type Reason = (typeof REASONS)[number];

/** End respectfully (screen 40): editable template, optional private reason, then a kind closing state. */
export function EndSheet({ visible, onClose, matchId, other }: { visible: boolean; onClose: () => void; matchId: string; other: ProfileCard }) {
  const t = useT();
  const ts = useTs();
  const close = useCloseMatch(matchId);
  const showToast = useUi((s) => s.showToast);
  const template = ts('chat.end.template', other.gender);
  const [message, setMessage] = useState(template);
  const [reason, setReason] = useState<Reason | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (visible && !done) setMessage((m) => m || template);
  }, [visible, done, template]);

  const edited = message.trim() !== template.trim();

  const submit = () => {
    const text = message.trim() || template;
    close.mutate(
      { template: edited ? 'custom' : 'respectful_default', message: text, reason: reason ?? undefined },
      {
        onSuccess: () => setDone(true),
        onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
      },
    );
  };

  if (done) {
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        testID="chat-end-done"
        footer={
          <Button
            testID="chat-end-back"
            label={t('chat.end.back')}
            fullWidth
            onPress={() => {
              onClose();
              router.replace('/(tabs)/conversations');
            }}
          />
        }
      >
        <View style={styles.done}>
          <View style={styles.doneIcon}>
            <Icon name="heart-outline" size={28} color={palette.gold500} />
          </View>
          <Text variant="heading" center>
            {t('chat.end.doneTitle')}
          </Text>
          <Text variant="body" color={colors.textMuted} center>
            {t('chat.end.doneBody')}
          </Text>
          <Text variant="bodyStrong" color={colors.primary} center style={{ marginTop: spacing.sm }}>
            {ts('chat.end.blessing', other.gender)}
          </Text>
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('chat.end.title')}
      subtitle={t('chat.end.subtitle', { name: other.firstName })}
      testID="chat-end-sheet"
      footer={
        <>
          <Button testID="chat-end-confirm" label={t('chat.end.confirm')} variant="dark" fullWidth loading={close.isPending} onPress={submit} />
          <Button label={t('common.actions.cancel')} variant="ghost" fullWidth onPress={onClose} />
        </>
      }
    >
      <Field label={t('chat.end.message')}>
        <TextField testID="chat-end-message" value={message} onChangeText={setMessage} multiline maxLength={600} />
      </Field>
      {edited ? (
        <Pressable accessibilityRole="button" onPress={() => setMessage(template)} style={{ alignSelf: 'flex-start' }} hitSlop={6}>
          <Text variant="caption" weight="semibold" color={colors.primary}>
            {t('chat.end.reset')}
          </Text>
        </Pressable>
      ) : null}
      <View style={{ gap: spacing.sm }}>
        <Text variant="small" weight="semibold" color={colors.textMuted}>
          {t('chat.end.reason')}
        </Text>
        <ChipRow>
          {REASONS.map((r) => (
            <Chip
              key={r}
              size="sm"
              tone="neutral"
              label={t(`chat.end.reasons.${r}`)}
              selected={reason === r}
              onPress={() => setReason(reason === r ? null : r)}
            />
          ))}
        </ChipRow>
        <Text variant="caption" color={colors.textSubtle}>
          {ts('chat.end.reasonHint', other.gender, { name: other.firstName })}
        </Text>
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  done: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.premiumSoft, alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
});
