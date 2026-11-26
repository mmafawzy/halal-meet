/**
 * React Query hooks for the notifications inbox and preferences (`api.notifications`).
 */
import type { NotificationPrefs, NotificationPrefsInput, NotificationsPage } from '@halal-meet/core';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { useSession } from '@/state/session';

export const notifQk = {
  all: ['notifications'] as const,
  list: ['notifications', 'list'] as const,
  unread: ['notifications', 'unread'] as const,
  prefs: ['notifications', 'prefs'] as const,
};

export function invalidateNotifications(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: notifQk.list });
  void qc.invalidateQueries({ queryKey: notifQk.unread });
}

export function useNotificationsInbox() {
  return useInfiniteQuery({
    queryKey: notifQk.list,
    queryFn: ({ pageParam }) => api.notifications.list(pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last: NotificationsPage) => last.nextBefore,
  });
}

/** Unread badge. Polls gently (the SSE stream invalidates it immediately in live mode on the web). */
export function useUnreadCount() {
  const token = useSession((s) => s.token);
  return useQuery({
    queryKey: notifQk.unread,
    queryFn: () => api.notifications.unreadCount(),
    enabled: !!token,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { ids?: string[]; all?: boolean; matchId?: string }) => api.notifications.markRead(body),
    onSuccess: (unread) => {
      qc.setQueryData(notifQk.unread, unread);
      void qc.invalidateQueries({ queryKey: notifQk.list });
    },
  });
}

export function useNotificationPrefs() {
  return useQuery({ queryKey: notifQk.prefs, queryFn: () => api.notifications.prefs(), staleTime: 60_000 });
}

export function usePutNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NotificationPrefsInput) => api.notifications.putPrefs(body),
    onMutate: async (body) => {
      await qc.cancelQueries({ queryKey: notifQk.prefs });
      const prev = qc.getQueryData<NotificationPrefs>(notifQk.prefs);
      if (prev) {
        qc.setQueryData<NotificationPrefs>(notifQk.prefs, {
          categories: { ...prev.categories, ...(body.categories ?? {}) } as NotificationPrefs['categories'],
          topPicksTime: body.topPicksTime ?? prev.topPicksTime,
          quietHours: body.quietHours ?? prev.quietHours,
        });
      }
      return { prev };
    },
    onError: (_e, _b, ctx) => {
      if (ctx?.prev) qc.setQueryData(notifQk.prefs, ctx.prev);
    },
    onSuccess: (prefs) => {
      qc.setQueryData(notifQk.prefs, prefs);
      // The Top Picks time changes when picks refresh.
      void qc.invalidateQueries({ queryKey: ['topPicks'] });
    },
  });
}
