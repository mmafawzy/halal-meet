import type { GuardianOpinionValue } from '@halal-meet/core';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { Button, Chip, ChipRow, Field, Sheet, TextField } from '@/components/ui';
import { useT } from '@/i18n';

import { OPINION_TONE, OPINIONS } from './shared';

/**
 * A guardian's 👍 / 🤔 / 👎 + private note on one introduction (spec 01 §46).
 * PUT /guardian/members/:memberId/opinions/:subjectId — only the member reads it.
 */
export function OpinionSheet({
  subject,
  memberName,
  initial,
  loading,
  onClose,
  onSubmit,
}: {
  /** The person the member was introduced to; null hides the sheet. */
  subject: { id: string; name: string } | null;
  memberName: string;
  initial?: { value: GuardianOpinionValue; note: string | null } | null;
  loading?: boolean;
  onClose: () => void;
  onSubmit: (value: GuardianOpinionValue, note: string | null) => void;
}) {
  const t = useT();
  const [choice, setChoice] = useState<GuardianOpinionValue | null>(null);
  const [note, setNote] = useState('');

  // Start from the existing opinion whenever a different introduction is opened.
  const subjectId = subject?.id ?? null;
  useEffect(() => {
    setChoice(initial?.value ?? null);
    setNote(initial?.note ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjectId]);

  return (
    <Sheet
      visible={!!subject}
      onClose={onClose}
      title={subject ? t('family.dashboard.opinionTitle', { name: subject.name }) : undefined}
      testID="guardian-opinion-sheet"
      footer={
        <>
          <Button
            label={t('family.dashboard.submit')}
            size="lg"
            fullWidth
            disabled={!choice}
            loading={loading}
            onPress={() => choice && onSubmit(choice, note.trim() ? note.trim() : null)}
            testID="guardian-opinion-submit"
          />
          <Button label={t('common.actions.cancel')} variant="ghost" fullWidth onPress={onClose} />
        </>
      }
    >
      <ChipRow>
        {OPINIONS.map((o) => (
          <View key={o} testID={`guardian-opinion-${o}`}>
            <Chip label={t(`family.dashboard.opinions.${o}`)} tone={OPINION_TONE[o]} selected={choice === o} onPress={() => setChoice(o)} />
          </View>
        ))}
      </ChipRow>
      <Field label={t('family.dashboard.opinionNote')} hint={t('family.dashboard.opinionHint', { name: memberName })}>
        <TextField
          value={note}
          onChangeText={setNote}
          placeholder={t('family.dashboard.opinionNotePlaceholder')}
          multiline
          maxLength={500}
          testID="guardian-opinion-note"
        />
      </Field>
    </Sheet>
  );
}
