import type { ProfileCard, Usage } from '@halal-meet/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Field, Icon, Sheet, Text, TextField } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { colors, palette, spacing } from '@/theme';

const NOTE_MAX = 300;

/**
 * Screen 25 — Interest sheet. `level: 'serious'` is the weekly Serious Interest (note always allowed);
 * `level: 'interest'` is used only when the plan allows a note on every interest.
 */
export function InterestSheet({
  card,
  level,
  usage,
  loading,
  onClose,
  onSend,
}: {
  card: ProfileCard | null;
  level: 'interest' | 'serious';
  usage: Usage | null;
  loading?: boolean;
  onClose: () => void;
  onSend: (note: string | undefined) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const [note, setNote] = useState('');

  useEffect(() => setNote(''), [card?.id, level]);

  if (!card) return null;

  const serious = level === 'serious';
  const seriousLeft = usage ? Math.max(0, usage.seriousLimit - usage.seriousUsed) : 1;
  const exhausted = serious && seriousLeft === 0;
  const trimmed = note.trim();

  return (
    <Sheet
      visible
      onClose={onClose}
      title={serious ? t('discover.serious.sheetTitle') : t('profile.interest.title')}
      testID={serious ? 'serious-sheet' : 'interest-sheet'}
      footer={
        exhausted ? (
          <Button
            label={t('common.actions.upgrade')}
            variant="gold"
            icon="sparkles"
            fullWidth
            onPress={() => {
              onClose();
              router.push({ pathname: '/paywall', params: { trigger: 'serious' } });
            }}
          />
        ) : (
          <Button
            label={serious ? t('discover.serious.send') : t('profile.interest.send')}
            variant={serious ? 'gold' : 'primary'}
            icon={serious ? 'star' : 'heart'}
            fullWidth
            haptic
            loading={loading}
            onPress={() => onSend(trimmed || undefined)}
            testID={serious ? 'serious-send' : 'interest-send'}
          />
        )
      }
    >
      {serious ? (
        <Card tone="premium" style={{ gap: spacing.sm }}>
          <View style={styles.row}>
            <Icon name="star" size={18} color={palette.gold500} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {t('discover.serious.left', { count: seriousLeft })}
            </Text>
          </View>
          <Text variant="small" color={colors.textMuted}>
            {exhausted
              ? t('profile.interest.seriousUsed', { when: usage ? formatDate(usage.resetsAt, locale) : '' })
              : t('discover.serious.sheetBody', { name: card.firstName })}
          </Text>
        </Card>
      ) : null}
      {!exhausted ? (
        <Field label={t('discover.serious.note')} hint={`${trimmed.length}/${NOTE_MAX}`}>
          <TextField
            value={note}
            onChangeText={setNote}
            multiline
            maxLength={NOTE_MAX}
            placeholder={t('discover.serious.notePlaceholder')}
            testID="interest-note"
          />
        </Field>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
