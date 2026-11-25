import { View } from 'react-native';

import { Button, Sheet, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

/** Calm confirmation in a bottom sheet (works the same on web, unlike Alert). */
export function ConfirmSheet({
  visible,
  onClose,
  title,
  body,
  confirmLabel,
  onConfirm,
  danger,
  loading,
  cancelLabel,
  testID,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  body?: string;
  confirmLabel: string;
  onConfirm: () => void;
  danger?: boolean;
  loading?: boolean;
  cancelLabel?: string;
  testID?: string;
}) {
  const t = useT();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button
            label={confirmLabel}
            variant={danger ? 'danger' : 'primary'}
            fullWidth
            loading={loading}
            onPress={onConfirm}
            testID={testID ? `${testID}-confirm` : undefined}
          />
          <Button label={cancelLabel ?? t('common.actions.cancel')} variant="ghost" fullWidth onPress={onClose} />
        </View>
      }
    >
      {body ? (
        <Text variant="body" color={colors.textMuted}>
          {body}
        </Text>
      ) : null}
    </Sheet>
  );
}
