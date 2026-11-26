import { notificationTarget } from '@halal-meet/core';
import { useQueryClient } from '@tanstack/react-query';
import { router, usePathname, type Href } from 'expo-router';
import { useEffect } from 'react';

import { api } from '@/api';
import { qk } from '@/api/hooks';
import { configureForegroundHandling, onNotificationTap } from '@/lib/push';
import { useSession } from '@/state/session';

import { invalidateNotifications, notifQk, useUnreadCount } from './hooks';
import { useRealtime } from './realtime';
import { registerPushDevice } from './registration';

/**
 * App-wide notification plumbing (mounted once in the root layout, renders nothing):
 * - registers the push token (live mode, native, permission already granted),
 * - routes notification taps to the right screen,
 * - keeps the realtime stream (`GET /events`, web/EventSource) open and refreshes chat, matches and the inbox,
 * - marks a conversation's message notification read while that chat is open.
 */
export function NotificationsBridge() {
  const qc = useQueryClient();
  const token = useSession((s) => s.token);
  const pathname = usePathname();
  const setConnected = useRealtime((s) => s.setConnected);
  const unread = useUnreadCount().data ?? 0;

  useEffect(() => {
    configureForegroundHandling();
  }, []);

  useEffect(() => {
    if (token) void registerPushDevice();
  }, [token]);

  useEffect(() => {
    if (!token) return;
    return onNotificationTap((data) => {
      const url = typeof data.url === 'string' ? data.url : notificationTarget(String(data.kind ?? ''), data);
      if (typeof data.notificationId === 'string') {
        void api.notifications.markRead({ ids: [data.notificationId] }).then(() => invalidateNotifications(qc), () => undefined);
      }
      if (url) router.push(url as Href);
    });
  }, [token, qc]);

  useEffect(() => {
    if (!token) return;
    const sub = api.notifications.subscribe({
      onStatus: setConnected,
      onEvent: (e) => {
        if (e.type === 'message' && typeof e.data.matchId === 'string') {
          void qc.invalidateQueries({ queryKey: qk.messages(e.data.matchId) });
          void qc.invalidateQueries({ queryKey: qk.matches });
        } else if (e.type === 'match') {
          void qc.invalidateQueries({ queryKey: qk.matches });
        } else if (e.type === 'notification') {
          invalidateNotifications(qc);
          if (e.data.kind === 'interest' || e.data.kind === 'serious_interest') void qc.invalidateQueries({ queryKey: qk.incoming });
        }
      },
    });
    return () => {
      sub?.close();
      setConnected(false);
    };
  }, [token, qc, setConnected]);

  // Reading a conversation clears its (collapsed) message notification.
  const chatId = pathname.startsWith('/chat/') ? pathname.slice('/chat/'.length).split('/')[0] : null;
  useEffect(() => {
    if (!token || !chatId) return;
    void api.notifications
      .markRead({ matchId: decodeURIComponent(chatId) })
      .then((unread) => {
        qc.setQueryData(notifQk.unread, unread);
        void qc.invalidateQueries({ queryKey: notifQk.list });
      })
      .catch(() => undefined);
    // Re-run when the unread count changes so a reply that lands while the chat is open is cleared too.
  }, [token, chatId, qc, unread > 0]);

  return null;
}
