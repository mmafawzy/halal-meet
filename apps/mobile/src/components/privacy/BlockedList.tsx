import type { BlockedMember } from '@halal-meet/core';
import { useState } from 'react';
import { View } from 'react-native';

import { Button, Card, ListRow, LoadingState, RowGroup, Sheet, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

import { useBlocks, useUnblock } from './usePrivacy';

/** Safety centre: people you blocked (GET /blocks), with unblock (DELETE /blocks/:subjectId). */
export function BlockedList() {
  const t = useT();
  const locale = useLocale();
  const blocks = useBlocks();
  const unblock = useUnblock();
  const [confirm, setConfirm] = useState<BlockedMember | null>(null);
  const name = (b: BlockedMember) => b.firstName ?? t('me.safety.blocked.unknown');

  const doUnblock = () => {
    if (!confirm) return;
    unblock.mutate(confirm.subjectId, {
      onSuccess: () => {
        setConfirm(null);
        useUi.getState().showToast({ message: t('me.safety.blocked.unblocked'), tone: 'success' });
      },
      onError: () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' }),
    });
  };

  return (
    <View style={{ gap: spacing.sm }} testID="safety-blocked">
      <Text variant="caption" color={colors.textMuted}>
        {t('me.safety.blocked.body')}
      </Text>
      {blocks.isLoading ? (
        <LoadingState />
      ) : (blocks.data ?? []).length === 0 ? (
        <Card tone="muted">
          <Text variant="small" color={colors.textMuted}>
            {t('me.safety.blocked.empty')}
          </Text>
        </Card>
      ) : (
        <RowGroup>
          {(blocks.data ?? []).map((b) => (
            <ListRow
              key={b.subjectId}
              icon="ban-outline"
              label={name(b)}
              description={t('me.safety.blocked.since', { date: formatDate(b.blockedAt, locale) })}
              right={
                <Text variant="small" weight="semibold" color={colors.primary}>
                  {t('me.safety.blocked.unblock')}
                </Text>
              }
              onPress={() => setConfirm(b)}
            />
          ))}
        </RowGroup>
      )}

      <Sheet
        visible={confirm !== null}
        onClose={() => setConfirm(null)}
        title={confirm ? t('me.safety.blocked.unblockTitle', { name: name(confirm) }) : undefined}
        testID="safety-unblock-sheet"
        footer={
          <View style={{ gap: spacing.sm }}>
            <Button label={t('me.safety.blocked.unblock')} fullWidth loading={unblock.isPending} onPress={doUnblock} testID="safety-unblock-confirm" />
            <Button label={t('common.actions.close')} variant="ghost" fullWidth onPress={() => setConfirm(null)} />
          </View>
        }
      >
        <Text variant="body" color={colors.textMuted}>
          {t('me.safety.blocked.unblockBody')}
        </Text>
      </Sheet>
    </View>
  );
}
