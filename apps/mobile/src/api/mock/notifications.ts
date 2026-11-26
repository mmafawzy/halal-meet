/**
 * In-memory notifications for the mock backend: the inbox, preferences and (no-op) devices, with the same
 * shapes as apps/api NotificationsService. `index.ts` calls `add()` for the demo events it already simulates
 * (mutual matches, replies, incoming interests, guardian acceptance / opinions / approvals). State lives on the
 * mock db under `notifications`, so it is snapshotted with the demo and cleared by Demo tools → Reset.
 * There is no realtime stream in mock mode: `subscribe()` returns null and the chat keeps polling.
 */
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_CATEGORIES,
  TOP_PICKS_TIME_RE,
  categoryOfKind,
  type NotificationItem,
  type NotificationPrefs,
} from '@halal-meet/core';

import type { NotificationsApi } from '../notifications';
import { ApiError } from '../types';

export interface MockNotificationsState {
  items: NotificationItem[];
  prefs: NotificationPrefs;
  devices: string[];
}

/** The parts of the mock db this module reads (structural subset of MockDb in ./index.ts). */
export interface NotificationsMockDb {
  notifications?: MockNotificationsState;
}

export interface MockNotificationsDeps {
  op: <T>(fn: () => T) => Promise<T>;
  /** The mock db; this module keeps its state under `notifications`. */
  db: () => object;
  now: () => Date;
  /** Free plan: incoming plain interests are a count only (no sender). */
  isFree: () => boolean;
  /** Display name of a seeded member (Latin or Arabic for the current locale). */
  nameOf: (id: string) => string | null;
}

const PAGE = 20;

function fresh(): MockNotificationsState {
  return { items: [], prefs: { ...DEFAULT_NOTIFICATION_PREFS, categories: { ...DEFAULT_NOTIFICATION_PREFS.categories } }, devices: [] };
}

export function createMockNotifications(deps: MockNotificationsDeps) {
  const { op, now } = deps;
  const state = (): MockNotificationsState => {
    const db = deps.db() as NotificationsMockDb;
    db.notifications ??= fresh();
    return db.notifications;
  };
  let seq = 0;

  /** Records an inbox item (call inside an `op`). Unread messages collapse per conversation, like the server. */
  function add(kind: string, payload: Record<string, unknown> = {}, at: Date = now()): void {
    const s = state();
    let p = { ...payload };
    const actor = [p.fromId, p.otherId, p.senderId, p.subjectId].find((v): v is string => typeof v === 'string');
    if (actor && p.firstName === undefined) {
      const name = deps.nameOf(actor);
      if (name) p.firstName = name;
    }
    if (kind === 'interest' && deps.isFree()) p = { level: 'interest', countOnly: true };
    if (kind === 'message' && typeof p.matchId === 'string') {
      const existing = s.items.find((i) => i.kind === 'message' && !i.read && i.payload.matchId === p.matchId);
      if (existing) {
        const count = typeof existing.payload.count === 'number' ? existing.payload.count : 1;
        existing.payload = { ...existing.payload, ...p, count: count + 1 };
        existing.createdAt = at.toISOString();
        s.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return;
      }
      p.count = 1;
    }
    s.items.unshift({
      id: `ntf_${at.getTime().toString(36)}_${(seq++).toString(36)}`,
      kind,
      category: categoryOfKind(kind),
      payload: p,
      read: false,
      createdAt: at.toISOString(),
    });
    s.items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (s.items.length > 200) s.items.length = 200;
  }

  const unread = () => state().items.filter((i) => !i.read).length;

  const api: NotificationsApi = {
    registerDevice: (_platform, token) =>
      op(() => {
        const s = state();
        if (!s.devices.includes(token)) s.devices.push(token);
      }),
    removeDevice: (token) =>
      op(() => {
        const s = state();
        s.devices = s.devices.filter((d) => d !== token);
      }),
    prefs: () => op(() => state().prefs),
    putPrefs: (body) =>
      op(() => {
        const s = state();
        if (body.topPicksTime !== undefined && !TOP_PICKS_TIME_RE.test(body.topPicksTime)) throw new ApiError(400, 'validation_error', null);
        const categories = { ...s.prefs.categories };
        for (const c of NOTIFICATION_CATEGORIES) {
          const v = body.categories?.[c];
          if (typeof v === 'boolean') categories[c] = v;
        }
        s.prefs = { categories, topPicksTime: body.topPicksTime ?? s.prefs.topPicksTime, quietHours: body.quietHours ?? s.prefs.quietHours };
        return s.prefs;
      }),
    list: (before) =>
      op(() => {
        const items = state().items;
        const start = before ? items.findIndex((i) => i.id === before) + 1 : 0;
        const page = items.slice(start, start + PAGE);
        const more = start + PAGE < items.length;
        return { items: page, nextBefore: more ? page[page.length - 1]!.id : null, unread: unread() };
      }),
    markRead: (body) =>
      op(() => {
        for (const i of state().items) {
          if (i.read) continue;
          if (body.all || body.ids?.includes(i.id) || (body.matchId && i.kind === 'message' && i.payload.matchId === body.matchId)) i.read = true;
        }
        return unread();
      }),
    unreadCount: () => op(() => unread()),
    subscribe: () => null,
  };

  return { api, add };
}
