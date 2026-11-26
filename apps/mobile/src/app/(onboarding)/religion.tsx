import { QUESTIONS_BY_KEY, canAnswerSelf, type Answer } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { joinList, optionLabels, RELIGION_KEYS, selfValues, useSaveDraftAnswers } from '@/components/onboarding/answers';
import { getReligiousConsent, setReligiousConsent } from '@/components/onboarding/draft';
import { recordConsent } from '@/components/privacy/consents';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { QuestionSheet } from '@/components/onboarding/QuestionSheet';
import { isAnswerComplete } from '@/components/questions/QuestionEditor';
import { Button, Card, Icon, ProgressBar, Tag, Text } from '@/components/ui';
import { useLocale, usePick, useT, useViewerGender } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * Screens 11–12 — religious practice and partner religious preferences, merged into one list.
 * Each row opens the shared QuestionEditor (own answer, what I'd accept, importance). Everything is
 * optional. If the user declined religious-data consent on the phone step, the list stays hidden
 * until they turn it on.
 * Skipped from spec: the per-item "Show on profile / matching only" toggle (no API field yet).
 */
export default function ReligionScreen() {
  const t = useT();
  const p = usePick();
  const locale = useLocale();
  const gender = useViewerGender();
  const answers = useSession((s) => s.draft.answers);
  const setAnswer = useSession((s) => s.setAnswer);
  const { saveDraftAnswers, saving } = useSaveDraftAnswers();

  const [consent, setConsent] = useState(getReligiousConsent() !== false);
  const [editing, setEditing] = useState<string | null>(null);

  const keys = RELIGION_KEYS.filter((k) => QUESTIONS_BY_KEY[k]);
  const answered = keys.filter((k) => isAnswerComplete(answers[k], gender)).length;

  const turnOn = () => {
    setReligiousConsent(true);
    setConsent(true);
    void recordConsent('religious_data', true);
  };

  const next = async () => {
    const ok = consent ? await saveDraftAnswers(keys) : true;
    if (ok) router.push('/(onboarding)/questions');
  };

  const onSave = (a: Answer) => {
    setAnswer(a);
    setEditing(null);
  };

  return (
    <OnboardingFrame
      step="religion"
      title={t('onboarding.religion.title')}
      subtitle={t('onboarding.religion.subtitle')}
      footer={
        <>
          <Button label={t('common.actions.continue')} size="lg" fullWidth loading={saving} onPress={() => void next()} testID="religion-continue" />
          {answered === 0 ? <Button label={t('common.actions.skip')} variant="ghost" fullWidth onPress={() => void next()} testID="religion-skip" /> : null}
        </>
      }
    >
      {!consent ? (
        <Card tone="muted">
          <View style={{ gap: spacing.sm }}>
            <View style={styles.row}>
              <Icon name="shield-checkmark-outline" size={20} color={colors.primary} />
              <Text variant="subheading" style={{ flex: 1 }}>
                {t('onboarding.religion.consentOffTitle')}
              </Text>
            </View>
            <Text variant="small" color={colors.textMuted}>
              {t('onboarding.religion.consentOffBody')}
            </Text>
            <Button label={t('onboarding.religion.consentOn')} variant="secondary" onPress={turnOn} testID="religion-consent-on" />
          </View>
        </Card>
      ) : (
        <>
          <View style={{ gap: spacing.sm }}>
            <Text variant="small" weight="semibold" color={colors.textMuted}>
              {t('onboarding.religion.answered', { n: answered, total: keys.length })}
            </Text>
            <ProgressBar value={keys.length ? answered / keys.length : 0} />
          </View>

          <View style={{ gap: spacing.sm }}>
            {keys.map((k) => {
              const q = QUESTIONS_BY_KEY[k]!;
              const a = answers[k];
              const done = isAnswerComplete(a, gender);
              const selfAllowed = canAnswerSelf(q, gender);
              const selfLabel = a ? joinList(optionLabels(k, selfValues(a), p), locale) : '';
              const pref = a?.accept?.length ? joinList(optionLabels(k, a.accept, p), locale) : '';
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={p(q.topic)}
                  onPress={() => setEditing(k)}
                  style={({ pressed }) => [styles.item, done && styles.itemDone, pressed && { backgroundColor: palette.sand100 }]}
                  testID={`religion-item-${k}`}
                >
                  <View style={[styles.check, done && styles.checkOn]}>
                    {done ? <Icon name="checkmark" size={14} color={palette.white} /> : null}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{p(q.topic)}</Text>
                    {done ? (
                      <>
                        {selfAllowed && selfLabel ? (
                          <Text variant="small" color={colors.textMuted} numberOfLines={1}>
                            {selfLabel}
                          </Text>
                        ) : null}
                        {pref ? (
                          <Text variant="caption" color={colors.textMuted} numberOfLines={2}>
                            {t('onboarding.religion.preference', { values: pref })}
                          </Text>
                        ) : null}
                      </>
                    ) : (
                      <Text variant="small" color={colors.textSubtle}>
                        {t('onboarding.religion.tapToAnswer')}
                      </Text>
                    )}
                  </View>
                  {done && a ? (
                    <Tag
                      label={t(`common.importance.${a.importance}`)}
                      tone={a.importance === 'dealbreaker' ? 'danger' : a.importance === 'must' ? 'gold' : 'primary'}
                    />
                  ) : null}
                  <Icon name="chevron-forward" size={18} color={colors.textSubtle} directional />
                </Pressable>
              );
            })}
          </View>

          <InlineNote icon="lock-closed-outline" text={t('onboarding.religion.privacyNote')} />
        </>
      )}

      <QuestionSheet questionKey={editing} value={editing ? answers[editing] : undefined} onClose={() => setEditing(null)} onSave={onSave} />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  itemDone: { borderColor: colors.primarySoft },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
