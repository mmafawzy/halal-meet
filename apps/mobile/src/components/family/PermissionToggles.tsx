import { GUARDIAN_PERMISSIONS, type GuardianPermission, type GuardianPermissions } from '@halal-meet/core';
import { View } from 'react-native';

import { RowGroup, ToggleRow } from '@/components/ui';
import { useT } from '@/i18n';

import { PERMISSION_ICONS } from './shared';

/** The eight granular guardian permissions (spec 01 §44) as switches. */
export function PermissionToggles({
  value,
  onChange,
}: {
  value: GuardianPermissions;
  onChange: (next: GuardianPermissions) => void;
}) {
  const t = useT();
  const toggle = (p: GuardianPermission, on: boolean) => onChange({ ...value, [p]: on });
  return (
    <RowGroup>
      {GUARDIAN_PERMISSIONS.map((p) => (
        <View key={p} testID={`family-perm-${p}`}>
          <ToggleRow
            icon={PERMISSION_ICONS[p]}
            label={t(`family.invite.permission.${p}.label`)}
            description={t(`family.invite.permission.${p}.desc`)}
            value={value[p]}
            onChange={(on) => toggle(p, on)}
          />
        </View>
      ))}
    </RowGroup>
  );
}
