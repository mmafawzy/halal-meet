import type { Gender, ReportBody } from '@halal-meet/core';
import { useState } from 'react';
import { View } from 'react-native';

import { useBlock, useReport } from '../../api/hooks';
import { useT, useTs } from '../../i18n';
import { useUi } from '../../state/ui';
import { colors, spacing } from '../../theme';
import { Button } from '../ui/Button';
import { Chip, ChipRow } from '../ui/Chip';
import { Field, TextField, ToggleRow } from '../ui/Form';
import { Sheet } from '../ui/Sheet';
import { Text } from '../ui/Text';

const CATEGORIES: ReportBody['category'][] = ['scam', 'harassment', 'fake_profile', 'inappropriate', 'underage', 'other'];

/** Report flow (screen 60): category → details → optional block. Never paywalled. */
export function ReportSheet({
  visible,
  onClose,
  subjectId,
  subjectName,
  subjectGender,
  messageIds,
  defaultCategory,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  subjectId: string;
  subjectName: string;
  subjectGender: Gender;
  messageIds?: string[];
  defaultCategory?: ReportBody['category'];
  /** Called after a successful report (with whether the user also blocked). */
  onDone?: (blocked: boolean) => void;
}) {
  const t = useT();
  const ts = useTs();
  const report = useReport();
  const block = useBlock();
  const showToast = useUi((s) => s.showToast);
  const [category, setCategory] = useState<ReportBody['category'] | null>(defaultCategory ?? null);
  const [details, setDetails] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(true);

  const submit = async () => {
    if (!category) return;
    await report.mutateAsync({ subjectId, category, details: details.trim() || undefined, messageIds });
    if (alsoBlock) await block.mutateAsync(subjectId);
    showToast({ message: t('common.report.thanks'), tone: 'success', durationMs: 3500 });
    setDetails('');
    setCategory(defaultCategory ?? null);
    onClose();
    onDone?.(alsoBlock);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('common.report.title', { name: subjectName })}
      subtitle={ts('common.report.subtitle', subjectGender, { name: subjectName })}
      footer={
        <Button
          label={t('common.report.submit')}
          variant="dark"
          fullWidth
          disabled={!category}
          loading={report.isPending || block.isPending}
          onPress={() => void submit()}
        />
      }
    >
      <View style={{ gap: spacing.sm }}>
        <Text variant="small" weight="semibold" color={colors.textMuted}>
          {t('common.report.category')}
        </Text>
        <ChipRow>
          {CATEGORIES.map((c) => (
            <Chip key={c} label={t(`common.report.categories.${c}`)} selected={category === c} tone="danger" onPress={() => setCategory(c)} />
          ))}
        </ChipRow>
      </View>
      <Field label={t('common.report.details')}>
        <TextField value={details} onChangeText={setDetails} multiline placeholder={t('common.report.detailsPlaceholder')} maxLength={1000} />
      </Field>
      <View style={{ marginHorizontal: -spacing.lg }}>
        <ToggleRow label={t('common.report.alsoBlock', { name: subjectName })} value={alsoBlock} onChange={setAlsoBlock} icon="hand-left-outline" />
      </View>
    </Sheet>
  );
}

/** Confirmation sheet for blocking (RN Alert is a no-op on web, so we use a sheet). */
export function BlockSheet({
  visible,
  onClose,
  subjectId,
  subjectName,
  subjectGender,
  onDone,
}: {
  visible: boolean;
  onClose: () => void;
  subjectId: string;
  subjectName: string;
  subjectGender: Gender;
  onDone?: () => void;
}) {
  const t = useT();
  const ts = useTs();
  const block = useBlock();
  const showToast = useUi((s) => s.showToast);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('common.report.blockTitle', { name: subjectName })}
      footer={
        <>
          <Button
            label={t('common.actions.block')}
            variant="danger"
            fullWidth
            loading={block.isPending}
            onPress={async () => {
              await block.mutateAsync(subjectId);
              showToast({ message: t('common.report.blocked', { name: subjectName }), tone: 'success' });
              onClose();
              onDone?.();
            }}
          />
          <Button label={t('common.actions.cancel')} variant="ghost" fullWidth onPress={onClose} />
        </>
      }
    >
      <Text variant="body" color={colors.textMuted}>
        {ts('common.report.blockBody', subjectGender)}
      </Text>
    </Sheet>
  );
}
