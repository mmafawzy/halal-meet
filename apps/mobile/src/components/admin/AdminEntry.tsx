import { isStaffRole, type MeResponse } from '@halal-meet/core';
import { router } from 'expo-router';

import { api } from '@/api';
import { ListRow, RowGroup, ToggleRow } from '@/components/ui';
import { useT } from '@/i18n';

import { adminHref } from './parts';
import { useSetDemoRole } from './useAdmin';

/**
 * Profile tab entry: a link to the console for moderators/admins, plus (mock mode only) a
 * "Demo moderator" switch so the console can be tried without a server.
 */
export function AdminEntry({ me }: { me: MeResponse }) {
  const t = useT();
  const setRole = useSetDemoRole();
  const staff = isStaffRole(me.role);
  const canDemo = !!api.admin.dev;
  if (!staff && !canDemo) return null;
  return (
    <RowGroup title={t('admin.title')}>
      {staff ? (
        <ListRow icon="shield-half-outline" label={t('admin.entry.open')} description={t('admin.entry.openBody')} onPress={() => router.push(adminHref.reports)} />
      ) : null}
      {canDemo ? (
        <ToggleRow
          icon="construct-outline"
          label={t('admin.entry.demoRole')}
          description={t('admin.entry.demoRoleBody')}
          value={staff}
          disabled={setRole.isPending}
          onChange={(on) => setRole.mutate(on ? 'moderator' : 'member')}
        />
      ) : null}
    </RowGroup>
  );
}
