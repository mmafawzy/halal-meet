import { QUESTIONS_BY_KEY, type Answer } from '@halal-meet/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { usePutPreferences } from '@/api/hooks';
import {
  isSameAsSelf,
  joinList,
  LOW_ELIGIBLE,
  normalizeAnswer,
  optionLabels,
  selfValues,
  useEligibleCount,
  useSaveDraftAnswers,
} from '@/components/onboarding/answers';
import { defaultPreferences } from '@/components/onboarding/draft';
import { useDealbreakerReasons } from '@/components/onboarding/notes';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { QuestionSheet } from '@/components/onboarding/QuestionSheet';
import { Button, Card, Field, Icon, Text, TextField } from '@/components/ui';
import { tNow, useLocale, usePick, useT } from '@/i18n';
import { ageFromBirthDate } from '@/lib/format';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * Screen 15 — dealbreakers review: every answer marked "Dealbreaker", with what it filters, a private
 * reason, "Make it Important" and edit; plus a live count of the people who pass the hard filters.
 * On entry the draft answers and match preferences are saved so the count reflects them.
 * Skipped from spec: "which dealbreaker would have the biggest effect" (needs a count per filter).
 */
export default function DealbreakersScreen() {
  const t = useT();
  const p = usePick();
  const locale = useLocale();
  const answers = useSession((s) => s.draft.answers);
  const setAnswer = useSession((s) => s.setAnswer);
  const reasons = useDealbreakerReasons((s) => s.notes);
  const setReason = useDealbreakerReasons((s) => s.setNote);
  const { saveDraftAnswers, saving } = useSaveDraftAnswers();
  const putPreferences = usePutPreferences();

  const [synced, setSynced] = useState(false);
  const [version, setVersion] = useState(0);
  const [editing, setEditing] = useState<string | null>(null);
  const [reasonOpen, setReasonOpen] = useState<Record<string, boolean>>({});

  const dealbreakers = Object.values(answers)
    .filter((a) => a.importance === 'dealbreaker' && QUESTIONS_BY_KEY[a.questionKey])
    .map(normalizeAnswer);

  /** Saves match preferences once (the backend applies the same defaults when none were sent). */
  const ensurePreferences = async (): Promise<boolean> => {
    const s = useSession.getState();
    if (s.preferences) return true;
    // Another device (or an earlier session) may already have saved them: GET /me/preferences.
    const existing = await api.privacy.preferences().catch(() => null);
    if (existing?.saved) return true;
    const gender = s.draft.gender ?? s.gender;
    const age = ageFromBirthDate(s.draft.birthDate);
    if (!gender || age === null) return true;
    try {
      await putPreferences.mutateAsync(defaultPreferences(gender, age));
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let alive = true;
    void (async () => {
      await saveDraftAnswers();
      await ensurePreferences();
      if (alive) setSynced(true);
    })();
    return () => {
      alive = false;
    };
    // Run once on entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const signature = `${version}:${dealbreakers.map((a) => `${a.questionKey}=${(a.accept ?? []).join('|')}`).join(',')}`;
  const count = useEligibleCount(signature, synced);

  const persist = async (a: Answer) => {
    setAnswer(a);
    const ok = await saveDraftAnswers([a.questionKey]);
    if (ok) setVersion((v) => v + 1);
  };

  const makeImportant = (a: Answer) => void persist({ ...a, importance: 'important' });

  const onSaveEdit = async (a: Answer) => {
    await persist(a);
    setEditing(null);
  };

  const next = async () => {
    const ok = (await saveDraftAnswers()) && (await ensurePreferences());
    if (!ok) {
      useUi.getState().showToast({ message: tNow('common.states.error'), tone: 'danger' });
      return;
    }
    router.push('/(onboarding)/notifications');
  };

  const low = count.data !== undefined && count.data < LOW_ELIGIBLE && dealbreakers.length > 0;

  return (
    <OnboardingFrame
      step="dealbreakers"
      title={t('onboarding.dealbreakers.title')}
      subtitle={t('onboarding.dealbreakers.subtitle')}
      keyboard
      footer={
        <Button
          label={t('common.actions.continue')}
          size="lg"
          fullWidth
          loading={saving || putPreferences.isPending}
          onPress={() => void next()}
          testID="dealbreakers-continue"
        />
      }
    >
      {/* Live counter */}
      <Card tone={low ? 'discuss' : 'primary'}>
        <View style={styles.counter} testID="dealbreakers-counter">
          {!synced || count.isLoading || count.isFetching ? (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                {t('onboarding.dealbreakers.counting')}
              </Text>
            </>
          ) : count.isError ? (
            <>
              <Icon name="cloud-offline-outline" size={20} color={colors.textMuted} />
              <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                {t('onboarding.dealbreakers.counterError')}
              </Text>
            </>
          ) : (
            <>
              <Icon name={low ? 'alert-circle-outline' : 'people-outline'} size={22} color={low ? palette.amber500 : colors.primary} />
              <Text variant="bodyStrong" style={{ flex: 1 }}>
                {t('onboarding.dealbreakers.counter', { count: count.data ?? 0 })}
              </Text>
            </>
          )}
        </View>
        {low && !count.isFetching ? (
          <Text variant="small" color={colors.textMuted} style={{ marginTop: spacing.sm }}>
            {t('onboarding.dealbreakers.low')}
          </Text>
        ) : null}
      </Card>

      {dealbreakers.length === 0 ? (
        <Card tone="muted">
          <View style={{ gap: spacing.sm, alignItems: 'flex-start' }}>
            <View style={styles.noneIcon}>
              <Icon name="leaf-outline" size={22} color={colors.primary} />
            </View>
            <Text variant="subheading">{t('onboarding.dealbreakers.noneTitle')}</Text>
            <Text variant="small" color={colors.textMuted}>
              {t('onboarding.dealbreakers.noneBody')}
            </Text>
          </View>
        </Card>
      ) : (
        <View style={{ gap: spacing.md }}>
          {dealbreakers.map((a) => {
            const q = QUESTIONS_BY_KEY[a.questionKey]!;
            const summary = isSameAsSelf(a)
              ? t('onboarding.dealbreakers.sameAsYou', { value: joinList(optionLabels(q.key, selfValues(a), p), locale) })
              : a.accept?.length
                ? t('onboarding.dealbreakers.only', { values: joinList(optionLabels(q.key, a.accept, p), locale) })
                : null;
            const reason = reasons[q.key];
            const showReason = reasonOpen[q.key] || !!reason;
            return (
              <View key={q.key} style={styles.item} testID={`dealbreaker-${q.key}`}>
                <View style={styles.itemHead}>
                  <View style={styles.ban}>
                    <Icon name="ban-outline" size={18} color={colors.danger} />
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text variant="bodyStrong">{p(q.topic)}</Text>
                    {summary ? (
                      <Text variant="small" color={colors.textMuted}>
                        {summary}
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('common.actions.edit')}
                    onPress={() => setEditing(q.key)}
                    hitSlop={8}
                    style={styles.edit}
                  >
                    <Icon name="create-outline" size={18} color={colors.primary} />
                  </Pressable>
                </View>

                {showReason ? (
                  <Field label={t('onboarding.dealbreakers.reasonLabel')} hint={t('onboarding.dealbreakers.reasonPrivate')}>
                    <TextField
                      key={`reason-${q.key}`}
                      defaultValue={reason ?? ''}
                      maxLength={200}
                      placeholder={t('onboarding.dealbreakers.reasonPlaceholder')}
                      onChangeText={(v) => {
                        setReasonOpen((o) => ({ ...o, [q.key]: true }));
                        setReason(q.key, v);
                      }}
                    />
                  </Field>
                ) : null}

                <View style={styles.actions}>
                  {!showReason ? (
                    <Button
                      label={t('onboarding.dealbreakers.reasonAdd')}
                      variant="ghost"
                      size="sm"
                      icon="lock-closed-outline"
                      onPress={() => setReasonOpen((o) => ({ ...o, [q.key]: true }))}
                    />
                  ) : null}
                  <Button
                    label={t('onboarding.dealbreakers.makeImportant')}
                    variant="secondary"
                    size="sm"
                    onPress={() => makeImportant(a)}
                    testID={`dealbreaker-relax-${q.key}`}
                  />
                </View>
              </View>
            );
          })}
        </View>
      )}

      <InlineNote text={t('common.question.importanceHint')} />

      <QuestionSheet
        questionKey={editing}
        value={editing ? answers[editing] : undefined}
        onClose={() => setEditing(null)}
        onSave={(a) => void onSaveEdit(a)}
        saving={saving}
      />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  counter: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noneIcon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  item: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  itemHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  ban: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.dangerSoft, alignItems: 'center', justifyContent: 'center' },
  edit: { padding: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: spacing.sm },
});
