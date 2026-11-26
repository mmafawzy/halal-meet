import { router, type Href } from 'expo-router';

import { ListRow } from '@/components/ui';
import { useT } from '@/i18n';

/** Profile tab → Settings → Notifications. */
export function NotificationSettingsRow() {
  const t = useT();
  return (
    <ListRow
      icon="notifications-outline"
      label={t('notifications.settings.link')}
      description={t('notifications.settings.linkBody')}
      onPress={() => router.push('/notifications/settings' as Href)}
    />
  );
}
