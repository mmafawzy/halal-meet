import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, lte, or } from 'drizzle-orm';
import {
  CONSENT_KINDS,
  CONSENT_VERSION,
  MAX_PAUSE_DAYS,
  REQUIRED_CONSENTS,
  type BlockedMember,
  type Consent,
  type ConsentKind,
  type DataExport,
  type GuardianShareSummary,
  type MyPreferencesResponse,
  type PrivacyStatus,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { ageFromBirthDate, DAY_MS } from '../common/time';
import { EntitlementsService } from './entitlements';
import { FeedService } from './feed.service';
import { defaultPreferences } from './members';
import { NotificationsService } from './notifications.service';

/** Grace period before a deletion request is carried out (env DELETION_GRACE_DAYS, default 30). */
export function deletionGraceDays(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.DELETION_GRACE_DAYS);
  return Number.isFinite(n) && n >= 0 ? n : 30;
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

/**
 * Hard-deletes every account whose deletion grace period has passed. Most rows go with the account through
 * `ON DELETE CASCADE`; tables without a foreign key are cleaned here. Reports *about* the account are kept
 * (safety / legal retention, spec 05) — they hold no profile data, only ids. Returns the erased ids.
 */
export async function purgeExpiredDeletions(db: Db, now = new Date(), graceDays = deletionGraceDays()): Promise<string[]> {
  const cutoff = new Date(now.getTime() - graceDays * DAY_MS);
  const due = await db
    .select({ id: t.accounts.id })
    .from(t.accounts)
    .where(and(isNotNull(t.accounts.deletionRequestedAt), lte(t.accounts.deletionRequestedAt, cutoff)));
  const erased: string[] = [];
  for (const { id } of due) {
    try {
      await db.transaction(async (tx) => {
        await tx.delete(t.passes).where(or(eq(t.passes.fromId, id), eq(t.passes.toId, id)));
        await tx.delete(t.feedImpressions).where(or(eq(t.feedImpressions.viewerId, id), eq(t.feedImpressions.candidateId, id)));
        await tx.delete(t.blocks).where(or(eq(t.blocks.blockerId, id), eq(t.blocks.blockedId, id)));
        await tx.delete(t.stageReadiness).where(eq(t.stageReadiness.accountId, id));
        await tx.delete(t.topicAnswers).where(eq(t.topicAnswers.accountId, id));
        await tx.delete(t.reports).where(eq(t.reports.reporterId, id));
        await tx.delete(t.accounts).where(eq(t.accounts.id, id));
      });
      erased.push(id);
    } catch (e) {
      // e.g. a staff account referenced by the moderation audit log: left for manual handling.
      // eslint-disable-next-line no-console
      console.warn(`[privacy] could not purge account ${id}:`, (e as Error).message);
    }
  }
  return erased;
}

/** Privacy centre: pause, incognito, consents, export, deletion, plus the loose-end reads (spec 05). */
@Injectable()
export class PrivacyService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(FeedService) private readonly feed: FeedService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private async account(id: string) {
    const [a] = await this.db.select().from(t.accounts).where(eq(t.accounts.id, id));
    if (!a) throw new NotFoundException({ error: 'unknown_account' });
    return a;
  }

  /** Every viewer's cached feed may contain this account, so visibility changes drop all queues. */
  private visibilityChanged(): void {
    this.feed.invalidate();
  }

  // ───────── Status ─────────

  async status(id: string, now = new Date()): Promise<PrivacyStatus> {
    let a = await this.account(id);
    // Auto-resume: a timed pause that has ended returns the account to active.
    if (a.status === 'paused' && a.pausedUntil && a.pausedUntil <= now) {
      await this.db.update(t.accounts).set({ status: 'active', pausedUntil: null }).where(eq(t.accounts.id, id));
      a = { ...a, status: 'active', pausedUntil: null };
    }
    const { entitlements } = await this.entitlements.snapshot(id, now);
    const canIncognito = entitlements.limits.incognito;
    const grace = deletionGraceDays();
    const suspended =
      (a.status === 'suspended' && (!a.suspendedUntil || a.suspendedUntil > now)) || (!!a.suspendedUntil && a.suspendedUntil > now);
    const paused = a.status === 'paused';
    const state: PrivacyStatus['state'] = a.deletionRequestedAt
      ? 'deletion_pending'
      : a.status === 'banned'
        ? 'banned'
        : suspended
          ? 'suspended'
          : paused
            ? 'paused'
            : 'active';
    return {
      state,
      paused,
      pausedUntil: paused ? iso(a.pausedUntil) : null,
      // Incognito only counts while the plan includes it.
      incognito: a.incognito && canIncognito,
      canIncognito,
      deletionRequestedAt: iso(a.deletionRequestedAt),
      deletionScheduledFor: a.deletionRequestedAt ? new Date(a.deletionRequestedAt.getTime() + grace * DAY_MS).toISOString() : null,
      graceDays: grace,
      suspendedUntil: suspended ? iso(a.suspendedUntil) : null,
    };
  }

  // ───────── Pause ─────────

  async pause(id: string, until: string | null, now = new Date()): Promise<PrivacyStatus> {
    const a = await this.account(id);
    if (a.status !== 'active' && a.status !== 'paused') throw new ConflictException({ error: 'cannot_pause', status: a.status });
    let end: Date | null = null;
    if (until !== null) {
      end = new Date(until);
      if (Number.isNaN(end.getTime())) throw new BadRequestException({ error: 'invalid_until' });
      if (end <= now) throw new BadRequestException({ error: 'until_in_past' });
      if (end.getTime() - now.getTime() > MAX_PAUSE_DAYS * DAY_MS) throw new BadRequestException({ error: 'pause_too_long', maxDays: MAX_PAUSE_DAYS });
    }
    await this.db.update(t.accounts).set({ status: 'paused', pausedUntil: end }).where(eq(t.accounts.id, id));
    this.visibilityChanged();
    return this.status(id, now);
  }

  async resume(id: string, now = new Date()): Promise<PrivacyStatus> {
    const a = await this.account(id);
    if (a.status === 'paused') {
      await this.db.update(t.accounts).set({ status: 'active', pausedUntil: null }).where(eq(t.accounts.id, id));
      this.visibilityChanged();
    }
    return this.status(id, now);
  }

  // ───────── Incognito ─────────

  async setIncognito(id: string, on: boolean, now = new Date()): Promise<PrivacyStatus> {
    await this.account(id);
    if (on) {
      const { entitlements } = await this.entitlements.snapshot(id, now);
      if (!entitlements.limits.incognito) throw new ForbiddenException({ error: 'plan_required', feature: 'incognito' });
    }
    await this.db.update(t.accounts).set({ incognito: on }).where(eq(t.accounts.id, id));
    this.visibilityChanged();
    return this.status(id, now);
  }

  // ───────── Deletion ─────────

  async requestDeletion(id: string, now = new Date()): Promise<PrivacyStatus> {
    const a = await this.account(id);
    if (!a.deletionRequestedAt) {
      await this.db.update(t.accounts).set({ deletionRequestedAt: now }).where(eq(t.accounts.id, id));
      this.visibilityChanged();
      const scheduledFor = new Date(now.getTime() + deletionGraceDays() * DAY_MS).toISOString();
      await this.notifications.notify(id, 'account_deletion_scheduled', { scheduledFor });
    }
    return this.status(id, now);
  }

  async cancelDeletion(id: string, now = new Date()): Promise<PrivacyStatus> {
    const a = await this.account(id);
    if (!a.deletionRequestedAt) return this.status(id, now);
    if (a.deletionRequestedAt.getTime() + deletionGraceDays() * DAY_MS <= now.getTime()) {
      throw new ConflictException({ error: 'grace_period_over' });
    }
    await this.db.update(t.accounts).set({ deletionRequestedAt: null }).where(eq(t.accounts.id, id));
    this.visibilityChanged();
    await this.notifications.notify(id, 'account_deletion_cancelled', {});
    return this.status(id, now);
  }

  async purge(now = new Date()): Promise<string[]> {
    const erased = await purgeExpiredDeletions(this.db, now);
    if (erased.length) this.visibilityChanged();
    return erased;
  }

  // ───────── Consents ─────────

  async consents(id: string): Promise<Consent[]> {
    const rows = await this.db.select().from(t.consents).where(eq(t.consents.accountId, id));
    return rows.map((r) => ({ kind: r.kind as ConsentKind, granted: r.granted, version: r.version, decidedAt: r.decidedAt.toISOString() }));
  }

  async putConsent(id: string, kind: string, granted: boolean, version = CONSENT_VERSION): Promise<Consent[]> {
    if (!CONSENT_KINDS.includes(kind as ConsentKind)) throw new BadRequestException({ error: 'unknown_consent', kinds: CONSENT_KINDS });
    if (!granted && REQUIRED_CONSENTS.includes(kind as ConsentKind)) throw new BadRequestException({ error: 'consent_required', kind });
    const now = new Date();
    await this.db
      .insert(t.consents)
      .values({ accountId: id, kind, granted, version, decidedAt: now })
      .onConflictDoUpdate({ target: [t.consents.accountId, t.consents.kind], set: { granted, version, decidedAt: now } });
    return this.consents(id);
  }

  // ───────── Preferences, blocks, shares ─────────

  async preferences(id: string, now = new Date()): Promise<MyPreferencesResponse> {
    const [row] = await this.db.select().from(t.matchPreferences).where(eq(t.matchPreferences.accountId, id));
    if (row) {
      return {
        saved: true,
        preferences: {
          ageMin: row.ageMin,
          ageMax: row.ageMax,
          maritalStatuses: (row.maritalStatuses as MyPreferencesResponse['preferences']['maritalStatuses']) ?? null,
          acceptChildren: row.acceptChildren,
          verifiedOnly: row.verifiedOnly,
          languages: row.languages ?? null,
          dimensionImportance: row.dimensionImportance ?? {},
        },
      };
    }
    const [p] = await this.db.select({ gender: t.profiles.gender, birthDate: t.profiles.birthDate }).from(t.profiles).where(eq(t.profiles.accountId, id));
    const d = defaultPreferences((p?.gender as 'male' | 'female') ?? 'male', p ? ageFromBirthDate(p.birthDate, now) : 28);
    return { saved: false, preferences: { ...d, dimensionImportance: {} } };
  }

  async blocks(id: string): Promise<BlockedMember[]> {
    const rows = await this.db
      .select({ subjectId: t.blocks.blockedId, createdAt: t.blocks.createdAt, firstName: t.profiles.firstName })
      .from(t.blocks)
      .leftJoin(t.profiles, eq(t.profiles.accountId, t.blocks.blockedId))
      .where(eq(t.blocks.blockerId, id))
      .orderBy(desc(t.blocks.createdAt));
    return rows.map((r) => ({ subjectId: r.subjectId, firstName: r.firstName ?? null, blockedAt: r.createdAt.toISOString() }));
  }

  /** Unblocking lets the person appear again; matches closed by the block stay closed. */
  async unblock(id: string, subjectId: string): Promise<void> {
    await this.db.delete(t.blocks).where(and(eq(t.blocks.blockerId, id), eq(t.blocks.blockedId, subjectId)));
    this.feed.invalidate(id);
    this.feed.invalidate(subjectId);
  }

  async guardianShares(id: string): Promise<GuardianShareSummary[]> {
    const rows = await this.db
      .select({ subjectId: t.guardianShares.subjectId, sharedAt: t.guardianShares.sharedAt, firstName: t.profiles.firstName })
      .from(t.guardianShares)
      .leftJoin(t.profiles, eq(t.profiles.accountId, t.guardianShares.subjectId))
      .where(eq(t.guardianShares.memberId, id))
      .orderBy(desc(t.guardianShares.sharedAt));
    return rows.map((r) => ({ subjectId: r.subjectId, firstName: r.firstName ?? null, sharedAt: r.sharedAt.toISOString() }));
  }

  // ───────── Export ─────────

  async export(id: string, now = new Date()): Promise<DataExport> {
    const a = await this.account(id);
    const db = this.db;
    const [
      profile,
      answers,
      prefs,
      verifications,
      photos,
      sent,
      passes,
      matchRows,
      guardians,
      guardianOf,
      shares,
      reports,
      blocks,
      consents,
      devices,
      notifPrefs,
      notifications,
      passport,
      subscriptions,
      purchases,
    ] = await Promise.all([
      db.select().from(t.profiles).where(eq(t.profiles.accountId, id)),
      db.select().from(t.answers).where(eq(t.answers.accountId, id)),
      db.select().from(t.matchPreferences).where(eq(t.matchPreferences.accountId, id)),
      db.select().from(t.verifications).where(eq(t.verifications.accountId, id)),
      db.select().from(t.photos).where(eq(t.photos.accountId, id)),
      db.select().from(t.interests).where(eq(t.interests.fromId, id)),
      db.select().from(t.passes).where(eq(t.passes.fromId, id)),
      db.select().from(t.matches).where(or(eq(t.matches.aId, id), eq(t.matches.bId, id))),
      db.select().from(t.guardianships).where(eq(t.guardianships.memberId, id)),
      db.select().from(t.guardianships).where(eq(t.guardianships.guardianId, id)),
      db.select().from(t.guardianShares).where(eq(t.guardianShares.memberId, id)),
      db.select().from(t.reports).where(eq(t.reports.reporterId, id)),
      db.select().from(t.blocks).where(eq(t.blocks.blockerId, id)),
      this.consents(id),
      db.select().from(t.devices).where(eq(t.devices.accountId, id)),
      db.select().from(t.notificationPrefs).where(eq(t.notificationPrefs.accountId, id)),
      db.select().from(t.notifications).where(eq(t.notifications.accountId, id)).orderBy(desc(t.notifications.createdAt)),
      db.select().from(t.passportDestinations).where(eq(t.passportDestinations.accountId, id)),
      db.select().from(t.subscriptions).where(eq(t.subscriptions.accountId, id)),
      db.select().from(t.purchases).where(eq(t.purchases.accountId, id)),
    ]);

    // Other people appear by id + first name only (what the member already saw).
    const otherIds = [...new Set([...sent.map((s) => s.toId), ...matchRows.map((m) => (m.aId === id ? m.bId : m.aId))])];
    const names = new Map<string, string>();
    if (otherIds.length) {
      const rows = await db.select({ id: t.profiles.accountId, firstName: t.profiles.firstName }).from(t.profiles).where(inArray(t.profiles.accountId, otherIds));
      for (const r of rows) names.set(r.id, r.firstName);
    }
    const matchIds = matchRows.map((m) => m.id);
    const myMessages = matchIds.length
      ? await db.select().from(t.messages).where(and(inArray(t.messages.matchId, matchIds), eq(t.messages.senderId, id))).orderBy(t.messages.sentAt)
      : [];
    const myTopicAnswers = await db.select({ messageId: t.topicAnswers.messageId, value: t.topicAnswers.value, answeredAt: t.topicAnswers.answeredAt, matchId: t.messages.matchId })
      .from(t.topicAnswers)
      .innerJoin(t.messages, eq(t.messages.id, t.topicAnswers.messageId))
      .where(eq(t.topicAnswers.accountId, id));
    const guardianshipIds = guardians.map((g) => g.id);
    const opinions = guardianshipIds.length
      ? await db.select().from(t.guardianOpinions).where(inArray(t.guardianOpinions.guardianshipId, guardianshipIds))
      : [];
    const memberNames = new Map<string, string>();
    if (guardianOf.length) {
      const rows = await db.select({ id: t.profiles.accountId, firstName: t.profiles.firstName }).from(t.profiles).where(inArray(t.profiles.accountId, guardianOf.map((g) => g.memberId)));
      for (const r of rows) memberNames.set(r.id, r.firstName);
    }

    const strip = <T extends Record<string, unknown>>(row: T, ...keys: Array<keyof T>): Record<string, unknown> => {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        if (keys.includes(k as keyof T)) continue;
        out[k] = v instanceof Date ? v.toISOString() : v;
      }
      return out;
    };

    return {
      format: 'halal-meet-export',
      version: 1,
      exportedAt: now.toISOString(),
      account: {
        id: a.id,
        phone: a.phoneE164,
        locale: a.locale,
        status: a.status,
        createdAt: a.createdAt.toISOString(),
        lastActiveAt: iso(a.lastActiveAt),
        pausedUntil: iso(a.pausedUntil),
        incognito: a.incognito,
        deletionRequestedAt: iso(a.deletionRequestedAt),
      },
      profile: profile[0] ? strip(profile[0]) : null,
      answers: answers.map((r) => strip(r, 'accountId')),
      preferences: prefs[0] ? strip(prefs[0], 'accountId') : null,
      verifications: verifications.map((r) => strip(r, 'accountId')),
      photos: photos.map((r) => strip(r, 'accountId')),
      interestsSent: sent.map((s) => ({
        toId: s.toId,
        toFirstName: names.get(s.toId) ?? null,
        level: s.level,
        note: s.note,
        status: s.status,
        createdAt: s.createdAt.toISOString(),
      })),
      passes: passes.map((p) => ({ toId: p.toId, reason: p.reason, createdAt: p.createdAt.toISOString() })),
      matches: matchRows.map((m) => {
        const otherId = m.aId === id ? m.bId : m.aId;
        return {
          matchId: m.id,
          otherId,
          otherFirstName: names.get(otherId) ?? null,
          stage: m.stage,
          status: m.status,
          createdAt: m.createdAt.toISOString(),
          myMessages: myMessages
            .filter((x) => x.matchId === m.id)
            .map((x) => ({ id: x.id, kind: x.kind, body: x.body, topicKey: x.topicKey, sentAt: x.sentAt.toISOString() })),
          myTopicAnswers: myTopicAnswers
            .filter((x) => x.matchId === m.id)
            .map((x) => ({ messageId: x.messageId, value: x.value, answeredAt: x.answeredAt.toISOString() })),
        };
      }),
      guardians: guardians.map((g) => strip(g, 'memberId', 'inviteTokenHash', 'guardianId')),
      guardianOpinionsReceived: opinions.map((o) => strip(o)),
      guardianOf: guardianOf.map((g) => ({
        guardianshipId: g.id,
        memberId: g.memberId,
        memberFirstName: memberNames.get(g.memberId) ?? null,
        relationship: g.relationship,
        status: g.status,
        acceptedAt: iso(g.acceptedAt),
      })),
      sharedWithGuardians: shares.map((s) => ({ subjectId: s.subjectId, sharedAt: s.sharedAt.toISOString() })),
      reportsFiled: reports.map((r) => ({
        id: r.id,
        subjectId: r.subjectId,
        category: r.category,
        details: r.details,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
      })),
      blocks: blocks.map((b) => ({ subjectId: b.blockedId, createdAt: b.createdAt.toISOString() })),
      consents,
      devices: devices.map((d) => strip(d, 'accountId', 'pushToken')),
      notificationPrefs: notifPrefs[0] ? strip(notifPrefs[0], 'accountId') : null,
      notifications: notifications.map((n) => strip(n, 'accountId')),
      passport: passport.map((p) => strip(p, 'accountId')),
      subscriptions: subscriptions.map((s) => strip(s, 'accountId')),
      purchases: purchases.map((p) => strip(p, 'accountId')),
    };
  }
}
