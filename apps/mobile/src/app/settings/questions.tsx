import { QUESTIONS, QUESTIONS_BY_KEY, canAnswerSelf, type Answer, type Dimension, type QuestionDef } from '@halal-meet/core';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAnswers, useSaveAnswers } from '@/api/hooks';
import { listJoin } from '@/components/me/MeSections';
import { InlineNote } from '@/components/onboarding/OnboardingFrame';
import { QuestionEditor, emptyAnswer, isAnswerComplete } from '@/components/questions/QuestionEditor';
import { Button, Chip, ChipRow, EmptyState, ErrorState, Header, Icon, LoadingState, ProgressBar, Screen, Sheet, Text } from '@/components/ui';
import { useLocale, usePick, useT, useViewerGender } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

type Filter = 'all' | Dimension;

/** Categories in the order they first appear in the core question list. */
const CATEGORIES: Dimension[] = QUESTIONS.reduce<Dimension[]>((acc, q) => (acc.includes(q.dimension) ? acc : [...acc, q.dimension]), []);

/** Question library — "Know yourself" (screen 51). Answers are saved with PUT /me/answers. */
export default function QuestionLibraryScreen() {
  const t = useT();
  const gender = useViewerGender();
  const answersQuery = useAnswers();
  const [filter, setFilter] = useState<Filter>('all');
  const [unansweredOnly, setUnansweredOnly] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);

  const answers = useMemo(() => {
    const map: Record<string, Answer> = {};
    (answersQuery.data ?? []).forEach((a) => (map[a.questionKey] = a));
    return map;
  }, [answersQuery.data]);

  const isDone = (key: string) => isAnswerComplete(answers[key], gender);
  const answeredTotal = QUESTIONS.filter((q) => isDone(q.key)).length;
  const countFor = (d: Dimension) => {
    const qs = QUESTIONS.filter((q) => q.dimension === d);
    return { n: qs.filter((q) => isDone(q.key)).length, total: qs.length };
  };

  const list = QUESTIONS.filter((q) => (filter === 'all' || q.dimension === filter) && (!unansweredOnly || !isDone(q.key)));

  const header = <Header title={t('me.library.title')} />;

  if (answersQuery.isLoading) return <Screen header={header}><LoadingState /></Screen>;
  if (answersQuery.isError) return <Screen header={header}><ErrorState onRetry={() => void answersQuery.refetch()} /></Screen>;

  return (
    <Screen header={header} testID="library-screen">
      <View style={{ gap: spacing.lg }}>
        <Text variant="small" color={colors.textMuted}>
          {t('me.library.subtitle')}
        </Text>

        <View style={styles.progress}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Icon name="help-buoy-outline" size={18} color={colors.primary} />
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {t('me.library.progress', { n: answeredTotal, total: QUESTIONS.length })}
            </Text>
          </View>
          <ProgressBar value={answeredTotal / QUESTIONS.length} />
          <Text variant="caption" color={colors.textMuted}>
            {t('me.library.unlockHint')}
          </Text>
        </View>

        <ChipRow>
          <Chip size="sm" label={t('me.library.all')} selected={filter === 'all'} onPress={() => setFilter('all')} />
          {CATEGORIES.map((d) => {
            const c = countFor(d);
            return (
              <Chip
                key={d}
                size="sm"
                icon={c.n === c.total ? 'checkmark-circle' : undefined}
                label={`${t(`common.dimension.${d}`)} · ${t('me.library.categoryProgress', c)}`}
                selected={filter === d}
                onPress={() => setFilter(d)}
              />
            );
          })}
        </ChipRow>
        <ChipRow>
          <Chip size="sm" tone="neutral" icon="funnel-outline" label={t('me.library.unansweredOnly')} selected={unansweredOnly} onPress={() => setUnansweredOnly((v) => !v)} />
        </ChipRow>

        {list.length === 0 ? (
          <EmptyState icon="checkmark-done-outline" title={t('me.library.allDone')} />
        ) : (
          <View style={{ gap: spacing.sm }}>
            {list.map((q) => (
              <QuestionRow key={q.key} q={q} answer={answers[q.key]} done={isDone(q.key)} onPress={() => setEditing(q.key)} />
            ))}
          </View>
        )}
      </View>

      {editing ? <EditSheet questionKey={editing} initial={answers[editing]} onClose={() => setEditing(null)} /> : null}
    </Screen>
  );
}

function QuestionRow({ q, answer, done, onPress }: { q: QuestionDef; answer: Answer | undefined; done: boolean; onPress: () => void }) {
  const t = useT();
  const p = usePick();
  const locale = useLocale();
  const gender = useViewerGender();
  const selfAllowed = canAnswerSelf(q, gender);
  const label = (v: string) => {
    const o = q.options.find((x) => x.value === v);
    return o ? p(o.label) : v;
  };

  const lines: string[] = [];
  if (done && answer) {
    if (selfAllowed && answer.self !== null) {
      const vals = Array.isArray(answer.self) ? answer.self : [answer.self];
      lines.push(t('me.library.you', { value: listJoin(vals.map(label), locale) }));
    }
    if (answer.accept?.length) lines.push(t('me.library.accept', { values: listJoin(answer.accept.map(label), locale) }));
    else if (!selfAllowed) lines.push(t('me.library.acceptAny'));
  }

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.sand100 }]}
      testID={`library-q-${q.key}`}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text variant="overline" color={colors.primary}>
          {p(q.topic)}
        </Text>
        <Text variant="body" weight="medium">
          {selfAllowed ? p(q.text) : p(q.partnerText)}
        </Text>
        {done ? (
          lines.map((l) => (
            <Text key={l} variant="caption" color={colors.textMuted} numberOfLines={2}>
              {l}
            </Text>
          ))
        ) : (
          <Text variant="caption" color={colors.textSubtle}>
            {t('me.library.notAnswered')}
          </Text>
        )}
        {done && answer ? (
          <Text variant="caption" weight="semibold" color={answer.importance === 'dealbreaker' ? colors.danger : colors.textMuted}>
            {t(`common.importance.${answer.importance}`)}
          </Text>
        ) : null}
      </View>
      {done ? (
        <Icon name="create-outline" size={18} color={colors.textMuted} />
      ) : (
        <Text variant="small" weight="semibold" color={colors.primary}>
          {t('me.library.answer')}
        </Text>
      )}
    </Pressable>
  );
}

function EditSheet({ questionKey, initial, onClose }: { questionKey: string; initial: Answer | undefined; onClose: () => void }) {
  const t = useT();
  const p = usePick();
  const gender = useViewerGender();
  const saveAnswers = useSaveAnswers();
  const [draft, setDraft] = useState<Answer>(initial ?? emptyAnswer(questionKey));
  const [attempted, setAttempted] = useState(false);
  const q = QUESTIONS_BY_KEY[questionKey];
  const complete = isAnswerComplete(draft, gender);

  const submit = () => {
    setAttempted(true);
    if (!complete) return;
    saveAnswers.mutate([draft], {
      onSuccess: () => {
        useUi.getState().showToast({ message: t('me.library.saved'), tone: 'success', durationMs: 2000 });
        onClose();
      },
      onError: () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' }),
    });
  };

  return (
    <Sheet
      visible
      onClose={onClose}
      title={q ? p(q.topic) : undefined}
      testID="library-sheet"
      footer={<Button label={t('me.library.save')} fullWidth loading={saveAnswers.isPending} onPress={submit} testID="library-save" />}
    >
      <QuestionEditor questionKey={questionKey} value={draft} onChange={setDraft} compact />
      {attempted && !complete ? <InlineNote tone="danger" text={t('me.library.incomplete')} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  progress: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: colors.primarySoft,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
});
