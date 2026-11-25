import type { Answer } from '@halal-meet/core';
import { useState } from 'react';

import { emptyAnswer, isAnswerComplete, QuestionEditor } from '@/components/questions/QuestionEditor';
import { Button, Sheet } from '@/components/ui';
import { useT, useViewerGender } from '@/i18n';

/**
 * Bottom sheet that edits one compatibility question with the shared QuestionEditor.
 * `onSave` receives the edited answer; the parent decides where it is stored.
 */
export function QuestionSheet({
  questionKey,
  value,
  onClose,
  onSave,
  saving,
}: {
  questionKey: string | null;
  value: Answer | undefined;
  onClose: () => void;
  onSave: (a: Answer) => void;
  saving?: boolean;
}) {
  const t = useT();
  const gender = useViewerGender();
  // Local edit state, reset whenever a different question (or stored value) is opened. Derived
  // synchronously so the editor's first render already sees the stored answer.
  const [edit, setEdit] = useState<{ key: string | null; base: Answer | undefined; answer: Answer | undefined }>({
    key: null,
    base: undefined,
    answer: undefined,
  });
  const fresh = edit.key !== questionKey || edit.base !== value;
  const draft = fresh ? (value ?? (questionKey ? emptyAnswer(questionKey) : undefined)) : edit.answer;
  const setDraft = (answer: Answer) => setEdit({ key: questionKey, base: value, answer });

  const complete = isAnswerComplete(draft, gender);
  const reset = () => setEdit({ key: null, base: undefined, answer: undefined });

  return (
    <Sheet
      visible={!!questionKey}
      onClose={() => {
        reset();
        onClose();
      }}
      testID="question-sheet"
      footer={
        <Button
          label={t('common.actions.save')}
          fullWidth
          disabled={!complete}
          loading={saving}
          onPress={() => {
            if (!draft) return;
            reset();
            onSave(draft);
          }}
          testID="question-sheet-save"
        />
      }
    >
      {questionKey ? <QuestionEditor key={questionKey} questionKey={questionKey} value={draft} onChange={setDraft} compact /> : null}
    </Sheet>
  );
}
