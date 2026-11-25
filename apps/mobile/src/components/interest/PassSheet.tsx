import type { PassBody, ProfileCard } from '@halal-meet/core';
import { View } from 'react-native';

import { Button, Chip, ChipRow, Sheet, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

export type PassReason = NonNullable<PassBody['reason']>;

const REASONS: PassReason[] = ['religion', 'location', 'age', 'life_plans', 'not_a_fit', 'prefer_not'];

/** Screen 26 — optional one-tap reason for "Not for me". Never shown to the other person. */
export function PassSheet({
  card,
  onClose,
  onConfirm,
}: {
  card: ProfileCard | null;
  onClose: () => void;
  onConfirm: (reason?: PassReason) => void;
}) {
  const t = useT();
  return (
    <Sheet
      visible={!!card}
      onClose={onClose}
      title={t('discover.pass.title')}
      subtitle={card ? t('discover.pass.subtitle', { name: card.firstName }) : undefined}
      testID="pass-sheet"
      footer={<Button label={t('common.actions.skip')} variant="ghost" fullWidth onPress={() => onConfirm()} testID="pass-skip" />}
    >
      <View style={{ gap: spacing.md }}>
        <ChipRow>
          {REASONS.map((r) => (
            <View key={r} testID={`pass-reason-${r}`}>
              <Chip label={t(`discover.pass.reasons.${r}`)} tone="neutral" onPress={() => onConfirm(r)} />
            </View>
          ))}
        </ChipRow>
        <Text variant="small" color={colors.textMuted}>
          {t('discover.pass.hint')}
        </Text>
      </View>
    </Sheet>
  );
}
