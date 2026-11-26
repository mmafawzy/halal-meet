import type { NotificationItem } from '@halal-meet/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { useRelativeTime } from '@/components/matches/shared';
import { Icon, Text } from '@/components/ui';
import { colors, palette, radii, spacing } from '@/theme';

import { useNotificationCopy } from './copy';

export function NotificationRow({ item, onPress }: { item: NotificationItem; onPress: () => void }) {
  const copy = useNotificationCopy()(item);
  const when = useRelativeTime();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      testID={`notification-${item.id}`}
      style={({ pressed }) => [styles.row, !item.read && styles.unread, pressed && { opacity: 0.85 }]}
    >
      <View style={[styles.icon, !item.read && { backgroundColor: colors.primaryTint }]}>
        <Icon name={copy.icon} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small" weight={item.read ? 'regular' : 'semibold'}>
          {copy.text}
        </Text>
        <Text variant="caption" color={colors.textSubtle}>
          {when(item.createdAt)}
        </Text>
      </View>
      {!item.read ? <View style={styles.dot} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  unread: { borderColor: colors.primaryTint },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: palette.sand200, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.primary },
});
