import { useState } from 'react';
import { View } from 'react-native';

import { useAccountActions } from '@/components/me/accountActions';
import { CheckRow } from '@/components/onboarding/CountrySheet';
import { Button, Sheet, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

import { useDataExport } from './useDataExport';
import { useRequestDeletion } from './usePrivacy';

/**
 * "Delete my account" (spec 05): one clear confirmation, the grace period spelled out, a copy of the data
 * offered first. Confirming hides the account at once (POST /me/deletion) and signs out.
 */
export function DeleteAccountSheet({ visible, onClose, graceDays }: { visible: boolean; onClose: () => void; graceDays: number }) {
  const t = useT();
  const [understood, setUnderstood] = useState(false);
  const request = useRequestDeletion();
  const exportData = useDataExport();
  const { signOut } = useAccountActions();

  const close = () => {
    setUnderstood(false);
    onClose();
  };

  const confirm = () =>
    request.mutate(undefined, {
      onSuccess: async () => {
        close();
        useUi.getState().showToast({ message: t('me.privacy.delete.doneToast'), durationMs: 4000 });
        await signOut();
      },
      onError: () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' }),
    });

  return (
    <Sheet
      visible={visible}
      onClose={close}
      title={t('me.privacy.delete.title')}
      testID="privacy-delete-sheet"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            label={t('me.privacy.delete.confirm')}
            variant="danger"
            fullWidth
            disabled={!understood}
            loading={request.isPending}
            onPress={confirm}
            testID="privacy-delete-confirm"
          />
          <Button label={t('me.privacy.delete.keep')} variant="ghost" fullWidth onPress={close} />
        </View>
      }
    >
      <View style={{ gap: spacing.md }}>
        <Text variant="body">{t('me.privacy.delete.body', { days: graceDays })}</Text>
        <Text variant="small" color={colors.textMuted}>
          {t('me.privacy.delete.lose')}
        </Text>
        <Text variant="small" color={colors.primary}>
          {t('me.privacy.delete.grace', { days: graceDays })}
        </Text>
        <Button
          label={t('me.privacy.delete.exportFirst')}
          variant="outline"
          size="sm"
          icon="download-outline"
          loading={exportData.isPending}
          onPress={() => exportData.mutate()}
          style={{ alignSelf: 'flex-start' }}
          testID="privacy-delete-export"
        />
        <CheckRow
          checked={understood}
          onChange={setUnderstood}
          label={t('me.privacy.delete.confirmLabel', { days: graceDays })}
          testID="privacy-delete-understood"
        />
      </View>
    </Sheet>
  );
}
