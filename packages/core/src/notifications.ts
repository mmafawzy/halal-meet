/**
 * Notifications contract (spec 02 §5, spec 01 §20 and §63): push devices, per-category preferences, the in-app
 * inbox and the realtime event stream. Every push carries real value; the inbox is the source of truth, push is
 * a best-effort copy of it that respects preferences and quiet hours.
 */

/** Preference categories a member can switch off (push only — the in-app inbox always records). */
export const NOTIFICATION_CATEGORIES = ['matches', 'messages', 'interests', 'family', 'topPicks', 'tips'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/**
 * Kinds the server emits. `payload` holds ids and template params only; clients render localised copy from the
 * kind. Other workstreams may add kinds (photo requests, moderation…): unknown kinds fall into the always-on
 * `account` category and clients show a neutral fallback.
 */
export type NotificationKind =
  | 'match'
  | 'message'
  | 'interest'
  | 'serious_interest'
  | 'guardian_accepted'
  | 'guardian_opinion'
  | 'guardian_stage_decision'
  | 'guardian_removed'
  | 'top_picks'
  | (string & {});

/** Category a kind belongs to; `null` = account/safety notices that cannot be switched off. */
export function categoryOfKind(kind: string): NotificationCategory | null {
  if (kind === 'match') return 'matches';
  if (kind === 'message') return 'messages';
  if (kind === 'interest' || kind === 'serious_interest') return 'interests';
  if (kind.startsWith('guardian_')) return 'family';
  if (kind === 'top_picks') return 'topPicks';
  if (kind === 'tip' || kind.startsWith('tip_')) return 'tips';
  return null;
}

/** `maghrib` (default, ~30 min after local Maghrib), `morning` (08:00), `evening` (21:00) or a local `HH:MM`. */
export type TopPicksTime = 'maghrib' | 'morning' | 'evening' | `${number}:${number}` | (string & {});

export const TOP_PICKS_TIME_PRESETS = ['maghrib', 'morning', 'evening'] as const;
export const TOP_PICKS_TIME_RE = /^(maghrib|morning|evening|([01]\d|2[0-3]):[0-5]\d)$/;

/** Quiet hours window (local time), applied when `quietHours` is on. Pushes in this window are deferred. */
export const QUIET_HOURS = { start: '23:00', end: '08:00' } as const;

export interface NotificationPrefs {
  categories: Record<NotificationCategory, boolean>;
  topPicksTime: TopPicksTime;
  /** No pushes 23:00–08:00 local; they are delivered in the morning instead. */
  quietHours: boolean;
}

export interface NotificationPrefsInput {
  categories?: Partial<Record<NotificationCategory, boolean>>;
  topPicksTime?: TopPicksTime;
  quietHours?: boolean;
}

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = {
  categories: { matches: true, messages: true, interests: true, family: true, topPicks: true, tips: true },
  topPicksTime: 'maghrib',
  quietHours: true,
};

export type PushPlatform = 'ios' | 'android' | 'web';
export interface RegisterDeviceBody { platform: PushPlatform; pushToken: string }

export interface NotificationItem {
  id: string;
  kind: NotificationKind;
  category: NotificationCategory | null;
  /**
   * Template params, e.g. { matchId, otherId, firstName } for `match`, { matchId, messageId, firstName, count }
   * for `message` (collapsed per thread while unread), { level, fromId?, firstName? } for interests (free plan:
   * `{ level: 'interest', countOnly: true }`), { guardianName, relationship, subjectId?, matchId?, stage?,
   * decision? } for family kinds, { day } for `top_picks`.
   */
  payload: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export interface NotificationsPage {
  items: NotificationItem[];
  /** Pass as `?before=` to load older items; null at the end. */
  nextBefore: string | null;
  unread: number;
}

/** `matchId` marks that conversation's collapsed `message` item read (the member opened the chat). */
export interface MarkReadBody { ids?: string[]; all?: boolean; matchId?: string }
export interface UnreadCountResponse { unread: number }

/** Server-Sent Events on `GET /events` (`Authorization: Bearer` or `?token=` for EventSource). */
export type RealtimeEventType = 'message' | 'match' | 'notification' | 'ready';
export interface RealtimeEvent {
  type: RealtimeEventType;
  /** `message`: { matchId, messageId }; `match`: { matchId, otherId }; `notification`: NotificationItem. */
  data: Record<string, unknown>;
}

/** Where tapping a notification goes in the app (mirrors the deep links pushes carry in `data.url`). */
export function notificationTarget(kind: string, payload: Record<string, unknown>): string | null {
  const s = (k: string) => (typeof payload[k] === 'string' ? (payload[k] as string) : null);
  if (kind === 'message' && s('matchId')) return `/chat/${s('matchId')}`;
  if (kind === 'match' && s('matchId')) return `/chat/${s('matchId')}`;
  if ((kind === 'interest' || kind === 'serious_interest') && s('fromId')) return `/profile/${s('fromId')}`;
  if (kind === 'interest' || kind === 'serious_interest') return '/matches';
  if (kind === 'guardian_stage_decision' && s('matchId')) return `/chat/${s('matchId')}`;
  if (kind === 'guardian_removed') return '/guardian';
  if (kind.startsWith('guardian_')) return '/family';
  if (kind === 'top_picks') return '/discover';
  if (kind === 'photo_request') return '/settings/photos';
  if (kind === 'photo_approved' && s('ownerId')) return `/profile/${s('ownerId')}`;
  if (kind === 'moderation') {
    const type = s('type');
    if (type === 'photo_not_approved') return '/settings/photos';
    if (type === 'suspended' || type === 'banned' || type === 'reinstated') return '/settings/privacy';
    if (type === 'report_reviewed' || type === 'warning' || type === 'message_removed') return '/settings/safety';
    return null;
  }
  if (kind === 'billing') return '/paywall';
  if (kind.startsWith('account_deletion_')) return '/settings/privacy';
  return null;
}

export const NOTIFICATION_ROUTES = {
  registerDevice: 'POST /me/devices',
  removeDevice: 'DELETE /me/devices/:token',
  getNotificationPrefs: 'GET /me/notification-prefs',
  putNotificationPrefs: 'PUT /me/notification-prefs',
  notifications: 'GET /notifications?before=&limit=',
  markNotificationsRead: 'POST /notifications/read',
  unreadCount: 'GET /notifications/unread-count',
  events: 'GET /events (SSE; ?token= for EventSource)',
} as const;
