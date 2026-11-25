import {
  QUESTIONS_BY_KEY,
  canAnswerSelf,
  canSetPreference,
  type Answer,
  type Importance,
} from '@halal-meet/core';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { usePick, useT, useViewerGender } from '../../i18n';
import { colors, palette, radii, spacing } from '../../theme';
import { Chip, ChipRow } from '../ui/Chip';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

export const IMPORTANCE_ORDER: Importance[] = ['dealbreaker', 'must', 'important', 'flexible'];

export function emptyAnswer(questionKey: string): Answer {
  return { questionKey, self: null, accept: null, importance: 'important' };
}

/** True when the answer carries enough information to be saved. */
export function isAnswerComplete(a: Answer | undefined, gender: 'male' | 'female'): boolean {
  if (!a) return false;
  const q = QUESTIONS_BY_KEY[a.questionKey];
  if (!q) return false;
  if (canAnswerSelf(q, gender)) return a.self !== null && (!Array.isArray(a.self) || a.self.length > 0);
  return !!a.accept && a.accept.length > 0;
}

/**
 * Answers one compatibility question:
 * - own answer (only if the viewer's gender answers this question about themself — `canAnswerSelf`)
 * - optional "what I'd accept in a spouse" (`canSetPreference`; mandatory when there is no self answer, e.g. a man's hijab preference)
 * - importance chips (Dealbreaker / Must / Important / Flexible)
 */
export function QuestionEditor({
  questionKey,
  value,
  onChange,
  showTitle = true,
  compact = false,
}: {
  questionKey: string;
  value: Answer | undefined;
  onChange: (a: Answer) => void;
  showTitle?: boolean;
  compact?: boolean;
}) {
  const t = useT();
  const p = usePick();
  const gender = useViewerGender();
  const q = QUESTIONS_BY_KEY[questionKey];
  const answer = value ?? emptyAnswer(questionKey);
  const selfAllowed = q ? canAnswerSelf(q, gender) : false;
  const prefAllowed = q ? canSetPreference(q, gender) : false;
  const [acceptOpen, setAcceptOpen] = useState(!selfAllowed || (answer.accept?.length ?? 0) > 0);

  if (!q) return null;
  const set = (patch: Partial<Answer>) => onChange({ ...answer, ...patch });
  const currentSelf = Array.isArray(answer.self) ? answer.self[0] : answer.self;

  const toggleAccept = (v: string) => {
    const cur = new Set(answer.accept ?? []);
    if (cur.has(v)) cur.delete(v);
    else cur.add(v);
    set({ accept: cur.size ? q.options.filter((o) => cur.has(o.value)).map((o) => o.value) : null });
  };

  return (
    <View style={{ gap: compact ? spacing.md : spacing.lg }}>
      {showTitle ? (
        <View style={{ gap: 4 }}>
          <Text variant="overline" color={colors.primary}>
            {p(q.topic)}
          </Text>
          <Text variant={compact ? 'subheading' : 'heading'}>{selfAllowed ? p(q.text) : p(q.partnerText)}</Text>
        </View>
      ) : null}

      {selfAllowed ? (
        <View style={{ gap: spacing.sm }}>
          {q.options.map((o) => {
            const selected = currentSelf === o.value;
            return (
              <Pressable
                key={o.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                onPress={() => set({ self: o.value })}
                style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && !selected && { backgroundColor: palette.sand100 }]}
              >
                <Text variant="body" weight={selected ? 'semibold' : 'regular'} style={{ flex: 1 }}>
                  {p(o.label)}
                </Text>
                <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="checkmark" size={13} color={palette.white} /> : null}</View>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      {prefAllowed ? (
        <View style={{ gap: spacing.sm }}>
          {selfAllowed ? (
            <Pressable onPress={() => setAcceptOpen((o) => !o)} style={styles.acceptToggle} accessibilityRole="button">
              <Icon name={acceptOpen ? 'remove-circle-outline' : 'add-circle-outline'} size={18} color={colors.primary} />
              <Text variant="small" weight="semibold" color={colors.primary}>
                {acceptOpen ? t('common.question.hideAccept') : t('common.question.addAccept')}
              </Text>
            </Pressable>
          ) : null}
          {acceptOpen ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="small" weight="semibold" color={colors.textMuted}>
                {selfAllowed ? t('common.question.accept') : t('common.question.acceptOnly')}
              </Text>
              <ChipRow>
                {q.options.map((o) => (
                  <Chip key={o.value} label={p(o.label)} selected={answer.accept?.includes(o.value) ?? false} onPress={() => toggleAccept(o.value)} />
                ))}
              </ChipRow>
              <Text variant="caption" color={colors.textSubtle}>
                {t('common.question.acceptHint')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <Text variant="small" weight="semibold" color={colors.textMuted}>
          {t('common.question.importance')}
        </Text>
        <ChipRow>
          {IMPORTANCE_ORDER.map((imp) => (
            <Chip
              key={imp}
              size="sm"
              tone={imp === 'dealbreaker' ? 'danger' : imp === 'must' ? 'gold' : 'primary'}
              label={t(`common.importance.${imp}`)}
              selected={answer.importance === imp}
              onPress={() => set({ importance: imp })}
            />
          ))}
        </ChipRow>
        {answer.importance === 'dealbreaker' ? (
          <Text variant="caption" color={colors.danger}>
            {t('common.question.importanceHint')}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md + 2,
    borderRadius: radii.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  acceptToggle: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 4 },
});
