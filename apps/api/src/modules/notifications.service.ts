import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or, sql, count } from 'drizzle-orm';
import {
  DEFAULT_NOTIFICATION_PREFS,
  NOTIFICATION_CATEGORIES,
  categoryOfKind,
  notificationTarget,
  type NotificationCategory,
  type NotificationItem,
  type NotificationPrefs,
  type NotificationPrefsInput,
  type NotificationsPage,
  type PushPlatform,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { uuidv7 } from '../common/ids';
import { EntitlementsService } from './entitlements';
import { PUSH_DRIVER, type PushDriver, type PushMessage } from './push';
import { RealtimeHub } from './realtime';
import { inQuietHours, topPicksCycle } from './top-picks-time';
import { pushCopy } from './notification-copy';

type Row = typeof t.notifications.$inferSelect;

interface Recipient {
  locale: string;
  country: string | null;
  prefs: NotificationPrefs;
}

/** How long after the local Top Picks refresh the daily reminder may still go out (e.g. after a restart). */
const TOP_PICKS_REMINDER_WINDOW_MS = 3 * 3_600_000;

/**
 * Single entry point for user-facing notifications. Other services call `notify()` and never talk to push
 * providers directly. Every call records an inbox item (the source of truth), publishes it on the realtime
 * stream, then pushes it to the member's devices unless the category is switched off (→ `skipped`) or it is
 * quiet hours, 23:00–08:00 local (→ `deferred`, sent by `processDue()` in the morning).
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger('Notifications');

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(RealtimeHub) private readonly realtime: RealtimeHub,
    @Inject(PUSH_DRIVER) private readonly push: PushDriver,
  ) {}

  /**
   * `payload` holds ids and template params only — clients render localised copy from `kind`. Never throws:
   * a failed notification must not undo the action that caused it.
   */
  async notify(accountId: string, kind: string, payload: Record<string, unknown> = {}, now = new Date()): Promise<void> {
    try {
      const prepared = await this.prepare(accountId, kind, payload);
      const row = await this.record(accountId, kind, prepared, now);
      this.publish(row);
      const delivery = this.deliver(row, now);
      if (this.push.inline) await delivery;
      else void delivery.catch((e: unknown) => this.log.warn(`push failed: ${(e as Error).message}`));
    } catch (e) {
      this.log.error(`notify(${kind}) failed: ${(e as Error).message}`);
    }
  }

  // ───────── Inbox ─────────

  async list(accountId: string, before: string | undefined, limit = 20): Promise<NotificationsPage> {
    const size = Math.max(1, Math.min(50, limit));
    const cursor = decodeBefore(before);
    const rows = await this.db
      .select()
      .from(t.notifications)
      .where(
        and(
          eq(t.notifications.accountId, accountId),
          cursor
            ? or(
                lt(t.notifications.createdAt, cursor.at),
                and(eq(t.notifications.createdAt, cursor.at), lt(t.notifications.id, cursor.id)),
              )
            : undefined,
        ),
      )
      .orderBy(desc(t.notifications.createdAt), desc(t.notifications.id))
      .limit(size + 1);
    const page = rows.slice(0, size);
    const last = page[page.length - 1];
    return {
      items: page.map(toItem),
      nextBefore: rows.length > size && last ? encodeBefore(last) : null,
      unread: await this.unreadCount(accountId),
    };
  }

  async unreadCount(accountId: string): Promise<number> {
    const [r] = await this.db
      .select({ n: count() })
      .from(t.notifications)
      .where(and(eq(t.notifications.accountId, accountId), isNull(t.notifications.readAt)));
    return Number(r?.n ?? 0);
  }

  async markRead(accountId: string, body: { ids?: string[]; all?: boolean }, now = new Date()): Promise<number> {
    const base = and(eq(t.notifications.accountId, accountId), isNull(t.notifications.readAt));
    if (body.all) await this.db.update(t.notifications).set({ readAt: now }).where(base);
    else if (body.ids?.length) await this.db.update(t.notifications).set({ readAt: now }).where(and(base, inArray(t.notifications.id, body.ids)));
    return this.unreadCount(accountId);
  }

  /** Marks the unread `message` item for one conversation as read (the member opened the chat). */
  async markThreadRead(accountId: string, matchId: string, now = new Date()): Promise<void> {
    await this.db
      .update(t.notifications)
      .set({ readAt: now })
      .where(
        and(
          eq(t.notifications.accountId, accountId),
          eq(t.notifications.kind, 'message'),
          isNull(t.notifications.readAt),
          sql`${t.notifications.payload}->>'matchId' = ${matchId}`,
        ),
      );
  }

  // ───────── Preferences ─────────

  async getPrefs(accountId: string): Promise<NotificationPrefs> {
    const [row] = await this.db.select().from(t.notificationPrefs).where(eq(t.notificationPrefs.accountId, accountId));
    return row ? toPrefs(row) : clonePrefs(DEFAULT_NOTIFICATION_PREFS);
  }

  async putPrefs(accountId: string, input: NotificationPrefsInput): Promise<NotificationPrefs> {
    const current = await this.getPrefs(accountId);
    const next: NotificationPrefs = {
      categories: { ...current.categories, ...stripUndefined(input.categories ?? {}) },
      topPicksTime: input.topPicksTime ?? current.topPicksTime,
      quietHours: input.quietHours ?? current.quietHours,
    };
    await this.db
      .insert(t.notificationPrefs)
      .values({ accountId, categories: next.categories, topPicksTime: next.topPicksTime, quietHours: next.quietHours, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: t.notificationPrefs.accountId,
        set: { categories: next.categories, topPicksTime: next.topPicksTime, quietHours: next.quietHours, updatedAt: new Date() },
      });
    return next;
  }

  // ───────── Devices ─────────

  /** Upsert by token: a token moves to whoever signed in last on that device. */
  async registerDevice(accountId: string, platform: PushPlatform, pushToken: string): Promise<void> {
    const now = new Date();
    await this.db
      .insert(t.devices)
      .values({ id: uuidv7(), accountId, platform, pushToken, lastSeenAt: now })
      .onConflictDoUpdate({ target: t.devices.pushToken, set: { accountId, platform, lastSeenAt: now } });
  }

  async removeDevice(accountId: string, pushToken: string): Promise<void> {
    await this.db.delete(t.devices).where(and(eq(t.devices.accountId, accountId), eq(t.devices.pushToken, pushToken)));
  }

  // ───────── Scheduler ─────────

  /**
   * Sends pushes deferred by quiet hours that are now due, and queues the daily Top Picks reminder for members
   * whose local refresh time has just passed. Idempotent; the scheduler calls it every minute and tests call it
   * directly with a fixed `now`.
   */
  async processDue(now = new Date()): Promise<{ deferredSent: number; deferredSkipped: number; topPicksQueued: number }> {
    let deferredSent = 0;
    let deferredSkipped = 0;
    const deferred = await this.db
      .select({ n: t.notifications, country: t.profiles.country })
      .from(t.notifications)
      .leftJoin(t.profiles, eq(t.profiles.accountId, t.notifications.accountId))
      .where(eq(t.notifications.pushStatus, 'deferred'))
      .orderBy(t.notifications.createdAt)
      .limit(500);
    for (const { n, country } of deferred) {
      if (inQuietHours(now, country)) continue;
      if (n.readAt) {
        // Already seen in the app overnight: a morning push would only be noise.
        await this.setPushStatus(n.id, 'skipped');
        deferredSkipped++;
        continue;
      }
      await this.deliver(n, now, true);
      deferredSent++;
    }

    let topPicksQueued = 0;
    const members = await this.db
      .select({ id: t.accounts.id, country: t.profiles.country, prefs: t.notificationPrefs })
      .from(t.accounts)
      .innerJoin(t.profiles, eq(t.profiles.accountId, t.accounts.id))
      .leftJoin(t.notificationPrefs, eq(t.notificationPrefs.accountId, t.accounts.id))
      .where(eq(t.accounts.status, 'active'));
    for (const m of members) {
      const prefs = m.prefs ? toPrefs(m.prefs) : DEFAULT_NOTIFICATION_PREFS;
      if (!prefs.categories.topPicks) continue;
      const cycle = topPicksCycle(now, m.country, prefs.topPicksTime);
      if (now.getTime() - cycle.startsAt.getTime() > TOP_PICKS_REMINDER_WINDOW_MS) continue;
      const [already] = await this.db
        .select({ id: t.notifications.id })
        .from(t.notifications)
        .where(
          and(
            eq(t.notifications.accountId, m.id),
            eq(t.notifications.kind, 'top_picks'),
            sql`${t.notifications.payload}->>'day' = ${cycle.day}`,
          ),
        )
        .limit(1);
      if (already) continue;
      await this.notify(m.id, 'top_picks', { day: cycle.day }, now);
      topPicksQueued++;
    }
    return { deferredSent, deferredSkipped, topPicksQueued };
  }

  // ───────── internals ─────────

  /** Adds display params (first names) and applies plan redaction before anything is stored. */
  private async prepare(accountId: string, kind: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
    const out = { ...payload };
    if (kind === 'interest') {
      // Free plan sees a count only for plain interests (PLAN_LIMITS.incomingInterests = 'count').
      const { entitlements } = await this.entitlements.snapshot(accountId);
      if (entitlements.limits.incomingInterests !== 'full') return { level: 'interest', countOnly: true };
    }
    const actorId = [out.fromId, out.otherId, out.senderId, out.subjectId, out.requesterId, out.ownerId].find((v): v is string => typeof v === 'string');
    if (actorId && out.firstName === undefined) {
      const [p] = await this.db.select({ firstName: t.profiles.firstName }).from(t.profiles).where(eq(t.profiles.accountId, actorId));
      if (p) out.firstName = p.firstName;
    }
    return out;
  }

  /** Inserts the inbox row; unread `message` items collapse per conversation (spec 02 §5: collapsed per thread). */
  private async record(accountId: string, kind: string, payload: Record<string, unknown>, now: Date): Promise<Row> {
    if (kind === 'message' && typeof payload.matchId === 'string') {
      const [existing] = await this.db
        .select()
        .from(t.notifications)
        .where(
          and(
            eq(t.notifications.accountId, accountId),
            eq(t.notifications.kind, 'message'),
            isNull(t.notifications.readAt),
            sql`${t.notifications.payload}->>'matchId' = ${payload.matchId}`,
          ),
        )
        .limit(1);
      if (existing) {
        const prevCount = typeof existing.payload.count === 'number' ? existing.payload.count : 1;
        const [updated] = await this.db
          .update(t.notifications)
          .set({ payload: { ...existing.payload, ...payload, count: prevCount + 1 }, createdAt: now, pushStatus: 'pending', pushedAt: null })
          .where(eq(t.notifications.id, existing.id))
          .returning();
        return updated!;
      }
      payload = { ...payload, count: 1 };
    }
    const [row] = await this.db.insert(t.notifications).values({ id: uuidv7(), accountId, kind, payload, createdAt: now }).returning();
    return row!;
  }

  private publish(row: Row): void {
    const item = toItem(row);
    this.realtime.publish(row.accountId, { type: 'notification', data: item as unknown as Record<string, unknown> });
    if (row.kind === 'message') {
      this.realtime.publish(row.accountId, { type: 'message', data: { matchId: row.payload.matchId, messageId: row.payload.messageId } });
    } else if (row.kind === 'match') {
      this.realtime.publish(row.accountId, { type: 'match', data: { matchId: row.payload.matchId, otherId: row.payload.otherId } });
    }
  }

  private async deliver(row: Row, now: Date, ignoreQuietHours = false): Promise<void> {
    const recipient = await this.recipient(row.accountId);
    const category = categoryOfKind(row.kind);
    // The member who caused the event (e.g. tapped the interest that made a match) is already in the app.
    if (row.payload.initiatedByYou === true) return this.setPushStatus(row.id, 'skipped');
    if (category && !recipient.prefs.categories[category]) return this.setPushStatus(row.id, 'skipped');
    if (!ignoreQuietHours && recipient.prefs.quietHours && inQuietHours(now, recipient.country)) return this.setPushStatus(row.id, 'deferred');

    const devices = await this.db.select().from(t.devices).where(eq(t.devices.accountId, row.accountId));
    if (devices.length === 0) return this.setPushStatus(row.id, 'skipped');

    const copy = pushCopy(row.kind, row.payload, recipient.locale);
    const url = notificationTarget(row.kind, row.payload);
    const messages: PushMessage[] = devices.map((d) => ({
      to: d.pushToken,
      title: copy.title,
      body: copy.body,
      data: { notificationId: row.id, kind: row.kind, url, ...pickIds(row.payload) },
      ...(row.kind === 'message' && typeof row.payload.matchId === 'string' ? { threadId: `chat-${row.payload.matchId}` } : {}),
    }));
    const tickets = await this.push.send(messages);
    const dead = tickets.filter((tk) => tk.unregistered).map((tk) => tk.token);
    if (dead.length) await this.db.delete(t.devices).where(inArray(t.devices.pushToken, dead));
    const ok = tickets.some((tk) => tk.ok);
    await this.db
      .update(t.notifications)
      .set({ pushStatus: ok ? 'sent' : 'failed', pushedAt: ok ? now : null })
      .where(eq(t.notifications.id, row.id));
  }

  private async setPushStatus(id: string, status: 'skipped' | 'deferred' | 'failed'): Promise<void> {
    await this.db.update(t.notifications).set({ pushStatus: status }).where(eq(t.notifications.id, id));
  }

  private async recipient(accountId: string): Promise<Recipient> {
    const [row] = await this.db
      .select({ locale: t.accounts.locale, country: t.profiles.country, prefs: t.notificationPrefs })
      .from(t.accounts)
      .leftJoin(t.profiles, eq(t.profiles.accountId, t.accounts.id))
      .leftJoin(t.notificationPrefs, eq(t.notificationPrefs.accountId, t.accounts.id))
      .where(eq(t.accounts.id, accountId));
    return {
      locale: row?.locale ?? 'ar',
      country: row?.country ?? null,
      prefs: row?.prefs ? toPrefs(row.prefs) : DEFAULT_NOTIFICATION_PREFS,
    };
  }
}

// ───────── helpers ─────────

function toItem(row: Row): NotificationItem {
  return {
    id: row.id,
    kind: row.kind,
    category: categoryOfKind(row.kind),
    payload: row.payload,
    read: row.readAt !== null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPrefs(row: typeof t.notificationPrefs.$inferSelect): NotificationPrefs {
  const categories = { ...DEFAULT_NOTIFICATION_PREFS.categories };
  for (const c of NOTIFICATION_CATEGORIES) {
    if (typeof row.categories[c] === 'boolean') categories[c] = row.categories[c]!;
  }
  return { categories, topPicksTime: row.topPicksTime, quietHours: row.quietHours };
}

function clonePrefs(p: NotificationPrefs): NotificationPrefs {
  return { ...p, categories: { ...p.categories } };
}

function stripUndefined(o: Partial<Record<NotificationCategory, boolean>>): Partial<Record<NotificationCategory, boolean>> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === 'boolean'));
}

function pickIds(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of ['matchId', 'fromId', 'otherId', 'subjectId', 'memberId', 'guardianshipId']) {
    if (typeof payload[k] === 'string') out[k] = payload[k];
  }
  return out;
}

function encodeBefore(row: Row): string {
  return Buffer.from(`${row.createdAt.toISOString()}|${row.id}`).toString('base64url');
}

function decodeBefore(before: string | undefined): { at: Date; id: string } | null {
  if (!before) return null;
  try {
    const [iso, id] = Buffer.from(before, 'base64url').toString('utf8').split('|');
    const at = new Date(iso ?? '');
    if (!id || Number.isNaN(at.getTime())) return null;
    return { at, id };
  } catch {
    return null;
  }
}
