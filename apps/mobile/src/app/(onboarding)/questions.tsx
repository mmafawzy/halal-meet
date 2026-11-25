import { QUESTIONS_BY_KEY, type Answer } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { STARTER_KEYS, useSaveDraftAnswers } from '@/components/onboarding/answers';
import { useQuestionNotes } from '@/components/onboarding/notes';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { isAnswerComplete, QuestionEditor } from '@/components/questions/QuestionEditor';
import { Button, Card, Field, ProgressBar, Star, Text, TextField } from '@/components/ui';
import { useT, useViewerGender } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * Screen 16 — starter marriage questions as a card stack: one question per card, optional
 * "Explain more" note, skip any question. After the last card a short "Great!" summary leads on to
 * the dealbreakers review. Answers are saved (PUT /me/answers) when the stack is finished.
 */
export default function QuestionsScreen() {
  const t = useT();
  const gender = useViewerGender();
  const answers = useSession((s) => s.draft.answers);
  const setAnswer = useSession((s) => s.setAnswer);
  const notes = useQuestionNotes((s) => s.notes);
  const setNote = useQuestionNotes((s) => s.setNote);
  const { saveDraftAnswers, saving } = useSaveDraftAnswers();

  const keys = STARTER_KEYS.filter((k) => QUESTIONS_BY_KEY[k]);
  const firstOpen = keys.findIndex((k) => !isAnswerComplete(answers[k], gender));
  const [index, setIndex] = useState(firstOpen === -1 ? 0 : firstOpen);
  const [finished, setFinished] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);

  const key = keys[index]!;
  const isLast = index === keys.length - 1;
  const complete = isAnswerComplete(answers[key], gender);
  const answeredTotal = Object.values(answers).filter((a) => isAnswerComplete(a, gender)).length;

  const finish = async () => {
    const ok = await saveDraftAnswers();
    if (ok) setFinished(true);
  };

  const advance = () => {
    setNoteOpen(false);
    if (isLast) void finish();
    else setIndex((i) => i + 1);
  };

  const onBack = () => {
    if (finished) return setFinished(false);
    if (index > 0) {
      setNoteOpen(false);
      return setIndex((i) => i - 1);
    }
    if (router.canGoBack()) router.back();
    else router.replace('/(onboarding)/religion');
  };

  if (finished) {
    return (
      <OnboardingFrame
        step="questions"
        title={t('onboarding.questions.doneTitle')}
        onBack={onBack}
        footer={
          <Button
            label={t('common.actions.continue')}
            size="lg"
            fullWidth
            onPress={() => router.push('/(onboarding)/dealbreakers')}
            testID="questions-done-continue"
          />
        }
      >
        <Card tone="primary">
          <View style={styles.done}>
            <View style={styles.doneIcon}>
              <Star size={30} color={palette.gold500} />
            </View>
            <Text variant="heading" center>
              {t('onboarding.questions.doneCount', { n: answeredTotal })}
            </Text>
            <Text variant="body" color={colors.textMuted} center>
              {t('onboarding.questions.doneBody')}
            </Text>
          </View>
        </Card>
      </OnboardingFrame>
    );
  }

  const onChange = (a: Answer) => setAnswer(a);

  return (
    <OnboardingFrame
      step="questions"
      title={t('onboarding.questions.title')}
      subtitle={index === 0 ? t('onboarding.questions.subtitle') : undefined}
      onBack={onBack}
      keyboard
      footer={
        <>
          <Button
            label={isLast ? t('onboarding.questions.finish') : t('common.actions.next')}
            size="lg"
            fullWidth
            disabled={!complete}
            loading={saving}
            onPress={advance}
            testID="questions-next"
          />
          <Button label={t('onboarding.questions.skipQuestion')} variant="ghost" fullWidth onPress={advance} testID="questions-skip" />
        </>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <Text variant="small" weight="semibold" color={colors.textMuted}>
          {t('onboarding.questions.progress', { n: index + 1, total: keys.length })}
        </Text>
        <ProgressBar value={(index + 1) / keys.length} color={palette.gold500} />
      </View>

      {/* Card stack: the current question sits on top of two faint "next" cards. */}
      <View>
        <View style={[styles.ghostCard, styles.ghost2]} />
        <View style={[styles.ghostCard, styles.ghost1]} />
        <View style={styles.card} testID={`questions-card-${key}`}>
          <QuestionEditor key={key} questionKey={key} value={answers[key]} onChange={onChange} />

          {noteOpen || notes[key] ? (
            <Field label={t('onboarding.questions.explainMore')} hint={t('onboarding.questions.explainPrivate')}>
              <TextField
                multiline
                maxLength={300}
                defaultValue={notes[key] ?? ''}
                key={`note-${key}`}
                placeholder={t('onboarding.questions.explainPlaceholder')}
                onChangeText={(v) => {
                  setNoteOpen(true);
                  setNote(key, v);
                }}
                testID="questions-note"
              />
            </Field>
          ) : (
            <Button
              label={t('onboarding.questions.explainMore')}
              variant="ghost"
              size="sm"
              icon="create-outline"
              onPress={() => setNoteOpen(true)}
              style={{ alignSelf: 'flex-start' }}
              testID="questions-explain"
            />
          )}
        </View>
      </View>

      <InlineNote icon="sparkles-outline" text={t('onboarding.frame.strengthHint')} />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.lg,
    padding: spacing.xl,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  ghostCard: {
    position: 'absolute',
    start: 0,
    end: 0,
    top: 0,
    bottom: 0,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.bgElevated,
  },
  ghost1: { marginHorizontal: spacing.sm, transform: [{ translateY: 8 }], opacity: 0.8 },
  ghost2: { marginHorizontal: spacing.lg, transform: [{ translateY: 16 }], opacity: 0.5 },
  done: { alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xl },
  doneIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
});
