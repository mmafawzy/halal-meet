import type { ProfileCard } from '@halal-meet/core';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Chip, Icon, Sheet, Text } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

import { useKeyFactText, type AbymAnswers, type AbymResponse } from './keyFacts';

const RESPONSES: Array<{ value: AbymResponse; key: string; tone: 'primary' | 'danger' | 'amber' }> = [
  { value: 'compatible', key: 'compatible', tone: 'primary' },
  { value: 'not_compatible', key: 'notCompatible', tone: 'danger' },
  { value: 'discuss', key: 'discuss', tone: 'amber' },
];

/**
 * Screen 24 — Ask Before You Match. One quick check per key fact; any "Not compatible" asks for
 * confirmation. Answers are shared with the other person only on a mutual match.
 */
export function AbymSheet({
  card,
  continueLabel,
  loading,
  onClose,
  onContinue,
}: {
  card: ProfileCard | null;
  continueLabel?: string;
  loading?: boolean;
  onClose: () => void;
  onContinue: (answers: AbymAnswers) => void;
}) {
  const t = useT();
  const ts = useTs();
  const factText = useKeyFactText();
  const [answers, setAnswers] = useState<AbymAnswers>({});
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    setAnswers({});
    setConfirming(false);
  }, [card?.id]);

  if (!card) return null;

  const facts = card.keyFacts;
  const allAnswered = facts.every((f) => answers[f.questionKey]);
  const firstNotCompatible = facts.find((f) => answers[f.questionKey] === 'not_compatible');

  const submit = () => {
    if (firstNotCompatible && !confirming) {
      setConfirming(true);
      return;
    }
    onContinue(answers);
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={t('profile.abym.title')}
      subtitle={ts('profile.abym.intro', card.gender, { name: card.firstName })}
      testID="abym-sheet"
      footer={
        confirming && firstNotCompatible ? (
          <>
            <Button
              label={t('profile.abym.continueAnyway')}
              variant="dark"
              fullWidth
              loading={loading}
              onPress={() => onContinue(answers)}
              testID="abym-send-anyway"
            />
            <Button label={t('profile.abym.review')} variant="ghost" fullWidth onPress={() => setConfirming(false)} testID="abym-review" />
          </>
        ) : (
          <>
            <Text variant="caption" color={colors.textMuted} center>
              {ts('profile.abym.sharedNote', card.gender)}
            </Text>
            <Button
              label={continueLabel ?? t('profile.abym.interest')}
              icon="heart"
              fullWidth
              haptic
              disabled={!allAnswered}
              loading={loading}
              onPress={submit}
              testID="abym-send"
            />
          </>
        )
      }
    >
      {confirming && firstNotCompatible ? (
        <Card tone="discuss" style={{ gap: spacing.sm }}>
          <View style={styles.row}>
            <Icon name="alert-circle-outline" size={20} color={colors.discuss} />
            <Text variant="subheading" style={{ flex: 1 }}>
              {t('profile.abym.notCompatibleTitle')}
            </Text>
          </View>
          <Text variant="body" color={colors.textMuted}>
            {ts('profile.abym.notCompatibleBody', card.gender, {
              topic: factText(firstNotCompatible).topic,
              name: card.firstName,
            })}
          </Text>
        </Card>
      ) : (
        facts.map((f) => {
          const { topic, value } = factText(f);
          const chosen = answers[f.questionKey];
          return (
            <View key={f.questionKey} style={styles.fact}>
              <Text variant="overline" color={colors.textMuted}>
                {topic}
              </Text>
              <Text variant="bodyStrong">{value}</Text>
              <Text variant="small" color={colors.textMuted}>
                {t('profile.abym.question')}
              </Text>
              <View style={styles.chips}>
                {RESPONSES.map((r) => (
                  <View key={r.value} testID={`abym-${f.questionKey}-${r.value}`}>
                    <Chip
                      label={t(`profile.abym.${r.key}`)}
                      tone={r.tone}
                      size="sm"
                      selected={chosen === r.value}
                      onPress={() => setAnswers((a) => ({ ...a, [f.questionKey]: r.value }))}
                    />
                  </View>
                ))}
              </View>
            </View>
          );
        })
      )}
      {!confirming && allAnswered ? (
        <View style={styles.row}>
          <Icon name="checkmark-circle" size={16} color={colors.primary} />
          <Text variant="small" color={colors.primary}>
            {t('profile.abym.allAnswered')}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fact: {
    gap: 4,
    padding: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
});
