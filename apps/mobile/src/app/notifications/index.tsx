import { notificationTarget, type NotificationItem } from '@halal-meet/core';
import { router, type Href } from 'expo-router';
import { View } from 'react-native';

import { useMarkNotificationsRead, useNotificationsInbox } from '@/components/notifications/hooks';
import { NotificationRow } from '@/components/notifications/NotificationRow';
import { Button, EmptyState, ErrorState, Header, IconButton, LoadingState, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { spacing } from '@/theme';

/** Notification center (spec 01 §63): newest first, unread highlighted, each item opens the exact screen. */
export default function NotificationsInbox() {
  const t = useT();
  const inbox = useNotificationsInbox();
  const markRead = useMarkNotificationsRead();

  const header = (
    <Header
      title={t('notifications.inbox.title')}
      right={
        <IconButton
          name="settings-outline"
          accessibilityLabel={t('notifications.inbox.settings')}
          onPress={() => router.push('/notifications/settings' as Href)}
        />
      }
    />
  );

  if (inbox.isLoading) return <Screen header={header}><LoadingState /></Screen>;
  if (inbox.isError || !inbox.data) return <Screen header={header}><ErrorState onRetry={() => void inbox.refetch()} /></Screen>;

  const items = inbox.data.pages.flatMap((p) => p.items);
  const unread = inbox.data.pages[0]?.unread ?? 0;

  const open = (item: NotificationItem) => {
    if (!item.read) markRead.mutate({ ids: [item.id] });
    const url = notificationTarget(item.kind, item.payload);
    if (url) router.push(url as Href);
  };

  return (
    <Screen header={header} testID="notifications-inbox">
      {items.length === 0 ? (
        <EmptyState icon="notifications-outline" title={t('notifications.inbox.emptyTitle')} body={t('notifications.inbox.emptyBody')} />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {unread > 0 ? (
            <Button
              label={t('notifications.inbox.markAll')}
              variant="ghost"
              size="sm"
              icon="checkmark-done-outline"
              style={{ alignSelf: 'flex-end' }}
              loading={markRead.isPending}
              onPress={() => markRead.mutate({ all: true })}
              testID="notifications-mark-all"
            />
          ) : null}
          {items.map((item) => (
            <NotificationRow key={item.id} item={item} onPress={() => open(item)} />
          ))}
          {inbox.hasNextPage ? (
            <Button
              label={t('notifications.inbox.loadMore')}
              variant="outline"
              size="sm"
              loading={inbox.isFetchingNextPage}
              onPress={() => void inbox.fetchNextPage()}
              testID="notifications-load-more"
            />
          ) : null}
        </View>
      )}
    </Screen>
  );
}
