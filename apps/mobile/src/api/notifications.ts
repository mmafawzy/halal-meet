/**
 * Notifications client (`NOTIFICATION_ROUTES` in @halal-meet/core): push devices, preferences, the in-app inbox
 * and the realtime event stream. Exposed as `api.notifications`; `live.ts` builds it over HTTP and
 * `mock/notifications.ts` in memory.
 */
import type {
  MarkReadBody,
  NOTIFICATION_ROUTES,
  NotificationPrefs,
  NotificationPrefsInput,
  NotificationsPage,
  PushPlatform,
  RealtimeEvent,
} from '@halal-meet/core';

export interface RealtimeSubscription {
  close(): void;
}

export interface RealtimeHandlers {
  onEvent(event: RealtimeEvent): void;
  /** true once the stream is open (`ready`), false when it drops (EventSource retries by itself). */
  onStatus(connected: boolean): void;
}

export interface NotificationsApi {
  registerDevice(platform: PushPlatform, pushToken: string): Promise<void>; // POST /me/devices
  removeDevice(pushToken: string): Promise<void>; // DELETE /me/devices/:token
  prefs(): Promise<NotificationPrefs>; // GET /me/notification-prefs
  putPrefs(body: NotificationPrefsInput): Promise<NotificationPrefs>; // PUT /me/notification-prefs
  list(before?: string | null): Promise<NotificationsPage>; // GET /notifications?before=
  markRead(body: MarkReadBody): Promise<number>; // POST /notifications/read → unread count
  unreadCount(): Promise<number>; // GET /notifications/unread-count
  /**
   * GET /events (Server-Sent Events). Returns null when no stream is available (native without EventSource,
   * mock mode, signed out); callers then keep polling.
   */
  subscribe(handlers: RealtimeHandlers): RealtimeSubscription | null;
}

export type NotificationRouteKey = keyof typeof NOTIFICATION_ROUTES;

export type NotificationsCall = <T>(
  route: NotificationRouteKey,
  opts?: { params?: Record<string, string>; query?: Record<string, string | null | undefined>; body?: unknown },
) => Promise<T>;

const EVENT_TYPES = ['message', 'match', 'notification'] as const;

/** The slice of the browser EventSource we use (no DOM lib in this project). */
interface EventSourceLike {
  addEventListener(type: string, listener: (e: { data?: string }) => void): void;
  onerror: ((e: unknown) => void) | null;
  close(): void;
}
type EventSourceCtor = new (url: string) => EventSourceLike;

export function createLiveNotificationsApi(call: NotificationsCall, opts: { baseUrl: string; getToken: () => string | null }): NotificationsApi {
  return {
    registerDevice: async (platform, pushToken) => {
      await call('registerDevice', { body: { platform, pushToken } });
    },
    removeDevice: async (pushToken) => {
      await call('removeDevice', { params: { token: pushToken } });
    },
    prefs: () => call('getNotificationPrefs'),
    putPrefs: (body) => call('putNotificationPrefs', { body }),
    list: (before) => call('notifications', { query: { before: before ?? undefined } }),
    markRead: async (body) => (await call<{ unread: number }>('markNotificationsRead', { body })).unread,
    unreadCount: async () => (await call<{ unread: number }>('unreadCount')).unread,
    subscribe: (handlers) => {
      const ES = (globalThis as { EventSource?: EventSourceCtor }).EventSource;
      const token = opts.getToken();
      if (!ES || !token) return null;
      // EventSource cannot send headers, so the token goes in the query string (server accepts ?token=).
      const source = new ES(`${opts.baseUrl.replace(/\/+$/, '')}/events?token=${encodeURIComponent(token)}`);
      source.addEventListener('ready', () => handlers.onStatus(true));
      source.onerror = () => handlers.onStatus(false);
      for (const type of EVENT_TYPES) {
        source.addEventListener(type, (e) => {
          try {
            handlers.onEvent({ type, data: JSON.parse(e.data ?? '{}') as Record<string, unknown> });
          } catch {
            // ignore malformed frames
          }
        });
      }
      return {
        close: () => {
          source.close();
          handlers.onStatus(false);
        },
      };
    },
  };
}
