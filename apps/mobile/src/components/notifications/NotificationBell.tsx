import { router, type Href } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { IconButton, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, palette } from '@/theme';

import { useUnreadCount } from './hooks';

/** Bell with an unread badge (Discover header) → the notifications inbox. */
export function NotificationBell() {
  const t = useT();
  const unread = useUnreadCount().data ?? 0;
  return (
    <View testID="notifications-bell">
      <IconButton
        name="notifications-outline"
        accessibilityLabel={unread > 0 ? t('notifications.bellUnread', { n: unread }) : t('notifications.bell')}
        bg={palette.white}
        onPress={() => router.push('/notifications' as Href)}
      />
      {unread > 0 ? (
        <View style={styles.badge} pointerEvents="none" testID="notifications-badge">
          <Text variant="caption" weight="bold" color={palette.white} fontLocale="en" style={styles.badgeText}>
            {unread > 9 ? '9+' : String(unread)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    top: -2,
    end: -2,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: palette.white,
  },
  badgeText: { fontSize: 10, lineHeight: 13 },
});
