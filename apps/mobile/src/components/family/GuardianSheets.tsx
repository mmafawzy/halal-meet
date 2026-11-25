import type { Guardian, GuardianPermissions } from '@halal-meet/core';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useRemoveGuardian, useUpdateGuardian } from '@/api/hooks';
import { Button, Icon, Sheet, Text } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

import { PermissionToggles } from './PermissionToggles';
import { guardianGender } from './shared';

/** Edit what an existing guardian can see. */
export function PermissionsSheet({ guardian, onClose }: { guardian: Guardian | null; onClose: () => void }) {
  const t = useT();
  const update = useUpdateGuardian();
  const showToast = useUi((s) => s.showToast);
  const [perms, setPerms] = useState<GuardianPermissions | null>(guardian?.permissions ?? null);

  // Reset only when a different guardian opens (list refetches must not wipe unsaved toggles).
  const guardianId = guardian?.id ?? null;
  useEffect(() => {
    setPerms(guardian?.permissions ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guardianId]);

  const save = () => {
    if (!guardian || !perms) return;
    update.mutate(
      { id: guardian.id, body: { permissions: perms } },
      {
        onSuccess: () => {
          showToast({ message: t('family.guardians.permissionsSaved'), tone: 'success', durationMs: 2000 });
          onClose();
        },
        onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
      },
    );
  };

  return (
    <Sheet
      visible={!!guardian}
      onClose={onClose}
      title={t('family.guardians.permissionsEdit')}
      subtitle={guardian ? `${guardian.name} · ${t(`family.invite.relationships.${guardian.relationship}`)}` : undefined}
      testID="family-permissions-sheet"
      footer={
        <>
          <Button label={t('common.actions.save')} fullWidth loading={update.isPending} onPress={save} testID="family-permissions-save" />
          <Button label={t('common.actions.cancel')} variant="ghost" fullWidth onPress={onClose} />
        </>
      }
    >
      {perms ? <PermissionToggles value={perms} onChange={setPerms} /> : null}
      <Text variant="caption" color={colors.textSubtle}>
        {t('family.disclosure.short')}
      </Text>
    </Sheet>
  );
}

/** Confirm before removing a guardian — they are told neutrally, with no reason and no details. */
export function RemoveGuardianSheet({ guardian, onClose }: { guardian: Guardian | null; onClose: () => void }) {
  const t = useT();
  const ts = useTs();
  const remove = useRemoveGuardian();
  const showToast = useUi((s) => s.showToast);

  const confirm = () => {
    if (!guardian) return;
    remove.mutate(guardian.id, {
      onSuccess: () => {
        showToast({ message: t('family.guardians.removed') });
        onClose();
      },
      onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
    });
  };

  return (
    <Sheet
      visible={!!guardian}
      onClose={onClose}
      title={guardian ? t('family.guardians.removeConfirm', { name: guardian.name }) : undefined}
      testID="family-remove-sheet"
      footer={
        <>
          <Button label={t('family.guardians.remove')} variant="danger" icon="person-remove-outline" fullWidth loading={remove.isPending} onPress={confirm} testID="family-remove-confirm" />
          <Button label={t('common.actions.cancel')} variant="ghost" fullWidth onPress={onClose} testID="family-remove-cancel" />
        </>
      }
    >
      {guardian ? (
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
          <Icon name="information-circle-outline" size={18} color={colors.textMuted} />
          <Text variant="body" color={colors.textMuted} style={{ flex: 1 }}>
            {ts('family.guardians.removeBody', guardianGender(guardian.relationship), { name: guardian.name })}
          </Text>
        </View>
      ) : null}
    </Sheet>
  );
}
