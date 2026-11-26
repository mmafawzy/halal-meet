import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gte, inArray, isNotNull, lt, or, type SQL } from 'drizzle-orm';
import {
  isStaffRole,
  reportPriority,
  type AdminAccountDetail,
  type AdminAccountRole,
  type AdminAccountStatus,
  type AdminAccountSummary,
  type AdminAuditPage,
  type AdminAuditQuery,
  type AdminEvidenceMessage,
  type AdminPhotoItem,
  type AdminPhotoStatus,
  type AdminReportBrief,
  type AdminReportCategory,
  type AdminReportDetail,
  type AdminReportListItem,
  type AdminReportPriority,
  type AdminReportStatus,
  type AdminRiskFlag,
  type AdminStats,
  type ModerationActionEntry,
  type ModerationActionKind,
  type ModerationNoticePayload,
  type PhotoDecisionBody,
  type ResolveReportBody,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { photoPath } from './photo-access';
import { uuidv7 } from '../common/ids';
import { ageFromBirthDate, DAY_MS } from '../common/time';
import { NotificationsService } from './notifications.service';

type ReportRow = typeof t.reports.$inferSelect;
type ActionRow = typeof t.moderationActions.$inferSelect;
type PhotoRow = typeof t.photos.$inferSelect;

/** Messages shown before/after each reported message. */
const CONTEXT_WINDOW = 3;
/** Messages shown when a report has no attached messages but the two people have a conversation. */
const FALLBACK_TAIL = 8;
const LIST_LIMIT = 200;

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export function maskPhone(phone: string): string {
  if (phone.length <= 6) return '•'.repeat(phone.length);
  return `${phone.slice(0, 4)}${'•'.repeat(phone.length - 6)}${phone.slice(-2)}`;
}

/**
 * Moderation console v1 (spec 05 §3, §5). Writes reports / moderation_actions / accounts.status /
 * suspended_until / messages.hidden / photos.status. Enforcement of suspensions and bans (auth, feed,
 * profiles) lives in the auth guard and visibility filters, not here.
 */
@Injectable()
export class ModerationService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  // ───────── Summaries ─────────

  async summaries(ids: string[]): Promise<Map<string, AdminAccountSummary>> {
    const unique = [...new Set(ids)];
    const out = new Map<string, AdminAccountSummary>();
    if (unique.length === 0) return out;
    const rows = await this.db
      .select({ a: t.accounts, p: t.profiles })
      .from(t.accounts)
      .leftJoin(t.profiles, eq(t.profiles.accountId, t.accounts.id))
      .where(inArray(t.accounts.id, unique));
    const verified = await this.db
      .select({ accountId: t.verifications.accountId })
      .from(t.verifications)
      .where(and(inArray(t.verifications.accountId, unique), eq(t.verifications.kind, 'identity'), eq(t.verifications.status, 'approved')));
    const verifiedSet = new Set(verified.map((v) => v.accountId));
    for (const { a, p } of rows) {
      out.set(a.id, {
        id: a.id,
        firstName: p?.firstName ?? null,
        gender: (p?.gender as 'male' | 'female' | undefined) ?? null,
        age: p ? ageFromBirthDate(p.birthDate) : null,
        country: p?.country ?? null,
        city: p?.city ?? null,
        role: a.role as AdminAccountRole,
        status: a.status as AdminAccountStatus,
        suspendedUntil: iso(a.suspendedUntil),
        identityVerified: verifiedSet.has(a.id),
        photoUrl: p?.photoUrl ?? null,
        createdAt: a.createdAt.toISOString(),
      });
    }
    return out;
  }

  /** For reports whose account row is gone (hard-deleted). */
  private missing(id: string): AdminAccountSummary {
    return {
      id,
      firstName: null,
      gender: null,
      age: null,
      country: null,
      city: null,
      role: 'member',
      status: 'deleted',
      suspendedUntil: null,
      identityVerified: false,
      photoUrl: null,
      createdAt: new Date(0).toISOString(),
    };
  }

  private brief(r: ReportRow): AdminReportBrief {
    return {
      id: r.id,
      category: r.category as AdminReportCategory,
      status: r.status as AdminReportStatus,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: iso(r.resolvedAt),
    };
  }

  private async actionEntries(rows: ActionRow[]): Promise<ModerationActionEntry[]> {
    const people = await this.summaries(rows.flatMap((r) => [r.moderatorId, r.subjectId]));
    return rows.map((r) => {
      const mod = people.get(r.moderatorId) ?? this.missing(r.moderatorId);
      const sub = people.get(r.subjectId) ?? this.missing(r.subjectId);
      return {
        id: r.id,
        action: r.action as ModerationActionKind,
        reason: r.reason,
        meta: r.meta ?? null,
        reportId: r.reportId,
        createdAt: r.createdAt.toISOString(),
        moderator: { id: mod.id, firstName: mod.firstName, role: mod.role },
        subject: { id: sub.id, firstName: sub.firstName, status: sub.status },
      };
    });
  }

  private async riskFlagsFor(subjectIds: string[]): Promise<Map<string, AdminRiskFlag[]>> {
    const out = new Map<string, AdminRiskFlag[]>();
    if (subjectIds.length === 0) return out;
    const rows = await this.db
      .selectDistinct({ senderId: t.messages.senderId, risk: t.messages.risk })
      .from(t.messages)
      .where(and(inArray(t.messages.senderId, subjectIds), isNotNull(t.messages.risk)));
    for (const r of rows) {
      if (!r.senderId || !r.risk) continue;
      const list = out.get(r.senderId) ?? [];
      list.push(r.risk as AdminRiskFlag);
      out.set(r.senderId, list);
    }
    for (const list of out.values()) list.sort();
    return out;
  }

  private async countsBySubject(table: 'reports' | 'actions', subjectIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (subjectIds.length === 0) return out;
    const rows =
      table === 'reports'
        ? await this.db.select({ id: t.reports.subjectId, n: count() }).from(t.reports).where(inArray(t.reports.subjectId, subjectIds)).groupBy(t.reports.subjectId)
        : await this.db
            .select({ id: t.moderationActions.subjectId, n: count() })
            .from(t.moderationActions)
            .where(inArray(t.moderationActions.subjectId, subjectIds))
            .groupBy(t.moderationActions.subjectId);
    for (const r of rows) out.set(r.id, Number(r.n));
    return out;
  }

  private async listItems(rows: ReportRow[]): Promise<AdminReportListItem[]> {
    const subjectIds = [...new Set(rows.map((r) => r.subjectId))];
    const [people, flags, reportCounts, actionCounts] = await Promise.all([
      this.summaries(rows.flatMap((r) => [r.reporterId, r.subjectId])),
      this.riskFlagsFor(subjectIds),
      this.countsBySubject('reports', subjectIds),
      this.countsBySubject('actions', subjectIds),
    ]);
    return rows.map((r) => ({
      id: r.id,
      status: r.status as AdminReportStatus,
      category: r.category as AdminReportCategory,
      priority: reportPriority(r.category),
      details: r.details,
      createdAt: r.createdAt.toISOString(),
      resolvedAt: iso(r.resolvedAt),
      resolvedBy: r.resolvedBy,
      reporter: people.get(r.reporterId) ?? this.missing(r.reporterId),
      subject: people.get(r.subjectId) ?? this.missing(r.subjectId),
      evidenceCount: r.evidenceMessageIds?.length ?? 0,
      riskFlags: flags.get(r.subjectId) ?? [],
      priorReportCount: Math.max(0, (reportCounts.get(r.subjectId) ?? 1) - 1),
      priorActionCount: actionCounts.get(r.subjectId) ?? 0,
    }));
  }

  // ───────── Reports ─────────

  async listReports(status: AdminReportStatus = 'open', category?: AdminReportCategory): Promise<AdminReportListItem[]> {
    const where: SQL[] = [eq(t.reports.status, status)];
    if (category) where.push(eq(t.reports.category, category));
    const rows = await this.db
      .select()
      .from(t.reports)
      .where(and(...where))
      .orderBy(status === 'open' ? asc(t.reports.createdAt) : desc(t.reports.resolvedAt))
      .limit(LIST_LIMIT);
    const items = await this.listItems(rows);
    if (status === 'open') {
      // Highest priority first, then oldest first (SLA order).
      const rank: Record<AdminReportPriority, number> = { p0: 0, p1: 1, p2: 2 };
      items.sort((a, b) => rank[a.priority] - rank[b.priority] || a.createdAt.localeCompare(b.createdAt));
    }
    return items;
  }

  private async reportRow(id: string): Promise<ReportRow> {
    const [row] = await this.db.select().from(t.reports).where(eq(t.reports.id, id));
    if (!row) throw new NotFoundException({ error: 'report_not_found' });
    return row;
  }

  async getReport(id: string): Promise<AdminReportDetail> {
    const row = await this.reportRow(id);
    const [item] = await this.listItems([row]);
    const [evidence, others, actions] = await Promise.all([
      this.evidence(row),
      this.db.select().from(t.reports).where(eq(t.reports.subjectId, row.subjectId)).orderBy(desc(t.reports.createdAt)),
      this.db.select().from(t.moderationActions).where(eq(t.moderationActions.subjectId, row.subjectId)).orderBy(desc(t.moderationActions.createdAt)),
    ]);
    return {
      ...item!,
      evidence,
      subjectReports: others.filter((r) => r.id !== row.id).map((r) => this.brief(r)),
      subjectActions: await this.actionEntries(actions),
    };
  }

  /** Reported messages with a few around each; falls back to the tail of their conversation. */
  private async evidence(report: ReportRow): Promise<AdminEvidenceMessage[]> {
    const ids = report.evidenceMessageIds ?? [];
    const author = (senderId: string | null): AdminEvidenceMessage['author'] =>
      senderId === null ? 'system' : senderId === report.subjectId ? 'subject' : senderId === report.reporterId ? 'reporter' : 'other';
    const toEvidence = (m: typeof t.messages.$inferSelect, reported: boolean): AdminEvidenceMessage => ({
      id: m.id,
      matchId: m.matchId,
      author: author(m.senderId),
      kind: m.kind,
      body: m.body,
      risk: (m.risk as AdminRiskFlag | null) ?? null,
      hidden: m.hidden,
      sentAt: m.sentAt.toISOString(),
      reported,
    });

    // Only conversations the reporter is part of can be cited as evidence.
    const reporterMatches = await this.db
      .select({ id: t.matches.id, aId: t.matches.aId, bId: t.matches.bId })
      .from(t.matches)
      .where(or(eq(t.matches.aId, report.reporterId), eq(t.matches.bId, report.reporterId)));
    const allowed = new Set(reporterMatches.map((m) => m.id));

    if (ids.length > 0) {
      const cited = (await this.db.select().from(t.messages).where(inArray(t.messages.id, ids))).filter((m) => allowed.has(m.matchId));
      const citedIds = new Set(cited.map((m) => m.id));
      const out: AdminEvidenceMessage[] = [];
      for (const matchId of [...new Set(cited.map((m) => m.matchId))]) {
        const convo = await this.db.select().from(t.messages).where(eq(t.messages.matchId, matchId)).orderBy(asc(t.messages.sentAt), asc(t.messages.id));
        const keep = new Set<number>();
        convo.forEach((m, i) => {
          if (!citedIds.has(m.id)) return;
          for (let j = Math.max(0, i - CONTEXT_WINDOW); j <= Math.min(convo.length - 1, i + CONTEXT_WINDOW); j++) keep.add(j);
        });
        [...keep].sort((a, b) => a - b).forEach((i) => out.push(toEvidence(convo[i]!, citedIds.has(convo[i]!.id))));
      }
      if (out.length > 0) return out;
    }

    const shared = reporterMatches.find((m) => m.aId === report.subjectId || m.bId === report.subjectId);
    if (!shared) return [];
    const tail = await this.db
      .select()
      .from(t.messages)
      .where(eq(t.messages.matchId, shared.id))
      .orderBy(desc(t.messages.sentAt), desc(t.messages.id))
      .limit(FALLBACK_TAIL);
    return tail.reverse().map((m) => toEvidence(m, false));
  }

  private async record(
    db: Db,
    entry: { moderatorId: string; subjectId: string; reportId?: string | null; action: ModerationActionKind; reason: string | null; meta?: Record<string, unknown> | null },
  ): Promise<void> {
    await db.insert(t.moderationActions).values({
      id: uuidv7(),
      moderatorId: entry.moderatorId,
      subjectId: entry.subjectId,
      reportId: entry.reportId ?? null,
      action: entry.action,
      reason: entry.reason,
      meta: entry.meta ?? null,
    });
  }

  private async assertCanAct(moderatorId: string, moderatorRole: string, subjectId: string) {
    if (subjectId === moderatorId) throw new BadRequestException({ error: 'cannot_moderate_self' });
    const [subject] = await this.db.select().from(t.accounts).where(eq(t.accounts.id, subjectId));
    if (!subject) throw new NotFoundException({ error: 'account_not_found' });
    if (isStaffRole(subject.role) && moderatorRole !== 'admin') throw new ForbiddenException({ error: 'staff_account' });
    return subject;
  }

  async resolve(moderatorId: string, moderatorRole: string, reportId: string, body: ResolveReportBody): Promise<AdminReportDetail> {
    const report = await this.reportRow(reportId);
    if (report.status !== 'open') throw new ConflictException({ error: 'report_closed' });
    const reason = body.reason.trim();
    if (!reason) throw new BadRequestException({ error: 'reason_required' });
    if (body.action !== 'dismiss') await this.assertCanAct(moderatorId, moderatorRole, report.subjectId);
    else if (report.subjectId === moderatorId) throw new BadRequestException({ error: 'cannot_moderate_self' });

    const now = new Date();
    let notice: ModerationNoticePayload | null = null;
    const meta: Record<string, unknown> = { category: report.category };

    if (body.action === 'suspend') {
      if (!body.days) throw new BadRequestException({ error: 'days_required' });
      meta.days = body.days;
    }
    if (body.action === 'hide_message') {
      if (!body.messageId) throw new BadRequestException({ error: 'message_required' });
      const [msg] = await this.db.select().from(t.messages).where(eq(t.messages.id, body.messageId));
      if (!msg || msg.senderId !== report.subjectId) throw new BadRequestException({ error: 'message_not_from_subject' });
      meta.messageId = msg.id;
      meta.matchId = msg.matchId;
    }

    await this.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      switch (body.action) {
        case 'warn':
          notice = { type: 'warning' };
          break;
        case 'hide_message':
          await db.update(t.messages).set({ hidden: true }).where(eq(t.messages.id, body.messageId!));
          notice = { type: 'message_removed', messageId: body.messageId! };
          break;
        case 'suspend': {
          const until = new Date(now.getTime() + body.days! * DAY_MS);
          await db.update(t.accounts).set({ status: 'suspended', suspendedUntil: until }).where(eq(t.accounts.id, report.subjectId));
          meta.until = until.toISOString();
          notice = { type: 'suspended', until: until.toISOString() };
          break;
        }
        case 'ban': {
          await db.update(t.accounts).set({ status: 'banned', suspendedUntil: null }).where(eq(t.accounts.id, report.subjectId));
          const closed = await db
            .update(t.matches)
            .set({ status: 'closed', closedBy: null, closeReason: 'moderation', updatedAt: now })
            .where(and(eq(t.matches.status, 'active'), or(eq(t.matches.aId, report.subjectId), eq(t.matches.bId, report.subjectId))))
            .returning({ id: t.matches.id });
          meta.closedMatches = closed.length;
          notice = { type: 'banned' };
          break;
        }
        case 'dismiss':
          break;
      }
      await db
        .update(t.reports)
        .set({ status: body.action === 'dismiss' ? 'dismissed' : 'actioned', resolvedAt: now, resolvedBy: moderatorId })
        .where(eq(t.reports.id, report.id));
      await this.record(db, { moderatorId, subjectId: report.subjectId, reportId: report.id, action: body.action, reason, meta });
    });

    // Neutral notices: the subject learns what applies to them (never who reported); the reporter only that it was reviewed.
    if (notice) await this.notifications.notify(report.subjectId, 'moderation', { ...(notice as ModerationNoticePayload) });
    if (report.reporterId !== report.subjectId) {
      await this.notifications.notify(report.reporterId, 'moderation', { type: 'report_reviewed', reportId: report.id } satisfies ModerationNoticePayload);
    }
    return this.getReport(report.id);
  }

  // ───────── Accounts ─────────

  async reinstate(moderatorId: string, moderatorRole: string, accountId: string, reasonRaw: string): Promise<AdminAccountDetail> {
    const subject = await this.assertCanAct(moderatorId, moderatorRole, accountId);
    if (subject.status !== 'suspended' && subject.status !== 'banned') throw new ConflictException({ error: 'not_restricted' });
    const reason = reasonRaw.trim();
    if (!reason) throw new BadRequestException({ error: 'reason_required' });
    await this.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      await db.update(t.accounts).set({ status: 'active', suspendedUntil: null }).where(eq(t.accounts.id, accountId));
      await this.record(db, { moderatorId, subjectId: accountId, action: 'reinstate', reason, meta: { from: subject.status } });
    });
    await this.notifications.notify(accountId, 'moderation', { type: 'reinstated' } satisfies ModerationNoticePayload);
    return this.account(moderatorId, accountId);
  }

  async account(viewerId: string, id: string): Promise<AdminAccountDetail> {
    const [row] = await this.db.select({ a: t.accounts, p: t.profiles }).from(t.accounts).leftJoin(t.profiles, eq(t.profiles.accountId, t.accounts.id)).where(eq(t.accounts.id, id));
    if (!row) throw new NotFoundException({ error: 'account_not_found' });
    const [people, verifications, against, by, actions, photos, [active]] = await Promise.all([
      this.summaries([id]),
      this.db.select().from(t.verifications).where(eq(t.verifications.accountId, id)).orderBy(asc(t.verifications.createdAt)),
      this.db.select().from(t.reports).where(eq(t.reports.subjectId, id)).orderBy(desc(t.reports.createdAt)),
      this.db.select().from(t.reports).where(eq(t.reports.reporterId, id)).orderBy(desc(t.reports.createdAt)),
      this.db.select().from(t.moderationActions).where(eq(t.moderationActions.subjectId, id)).orderBy(desc(t.moderationActions.createdAt)),
      this.db.select().from(t.photos).where(eq(t.photos.accountId, id)).orderBy(asc(t.photos.position)),
      this.db
        .select({ n: count() })
        .from(t.matches)
        .where(and(eq(t.matches.status, 'active'), or(eq(t.matches.aId, id), eq(t.matches.bId, id)))),
    ]);
    const { a, p } = row;
    return {
      account: { ...people.get(id)!, phoneMasked: maskPhone(a.phoneE164), locale: a.locale, lastActiveAt: iso(a.lastActiveAt) },
      profile: p
        ? { about: p.about, profession: p.profession, maritalStatus: p.maritalStatus, intention: p.intention, halalMode: p.halalMode, languages: p.languages }
        : null,
      verifications: verifications.map((v) => ({ kind: v.kind, status: v.status, decidedAt: iso(v.decidedAt) })),
      reportsAgainst: against.map((r) => this.brief(r)),
      reportsBy: by.map((r) => this.brief(r)),
      actions: await this.actionEntries(actions),
      photos: photos.map((ph) => ({ id: ph.id, status: ph.status as AdminPhotoStatus, url: photoUrl(viewerId, ph), createdAt: ph.createdAt.toISOString() })),
      activeMatches: Number(active?.n ?? 0),
    };
  }

  // ───────── Photos ─────────

  async listPhotos(viewerId: string, status: AdminPhotoStatus = 'pending'): Promise<AdminPhotoItem[]> {
    const rows = await this.db
      .select()
      .from(t.photos)
      .where(eq(t.photos.status, status))
      .orderBy(status === 'pending' ? asc(t.photos.createdAt) : desc(t.photos.createdAt))
      .limit(LIST_LIMIT);
    const owners = await this.summaries(rows.map((r) => r.accountId));
    return rows.map((r) => ({
      id: r.id,
      status: r.status as AdminPhotoStatus,
      url: photoUrl(viewerId, r),
      mime: r.mime,
      width: r.width,
      height: r.height,
      position: r.position,
      createdAt: r.createdAt.toISOString(),
      owner: owners.get(r.accountId) ?? this.missing(r.accountId),
    }));
  }

  async decidePhoto(moderatorId: string, photoId: string, body: PhotoDecisionBody): Promise<AdminPhotoItem> {
    const viewerId = moderatorId;
    const [photo] = await this.db.select().from(t.photos).where(eq(t.photos.id, photoId));
    if (!photo) throw new NotFoundException({ error: 'photo_not_found' });
    const reason = body.reason?.trim() || null;
    if (body.decision === 'reject' && !reason) throw new BadRequestException({ error: 'reason_required' });
    const status: AdminPhotoStatus = body.decision === 'approve' ? 'approved' : 'rejected';
    await this.db.transaction(async (tx) => {
      const db = tx as unknown as Db;
      await db.update(t.photos).set({ status }).where(eq(t.photos.id, photoId));
      await this.record(db, {
        moderatorId,
        subjectId: photo.accountId,
        action: body.decision === 'approve' ? 'approve_photo' : 'reject_photo',
        reason,
        meta: { photoId, previous: photo.status },
      });
    });
    if (status === 'rejected') {
      await this.notifications.notify(photo.accountId, 'moderation', { type: 'photo_not_approved', photoId } satisfies ModerationNoticePayload);
    }
    const [item] = await this.listPhotosByIds(viewerId, [photoId]);
    return item!;
  }

  private async listPhotosByIds(viewerId: string, ids: string[]): Promise<AdminPhotoItem[]> {
    const rows = await this.db.select().from(t.photos).where(inArray(t.photos.id, ids));
    const owners = await this.summaries(rows.map((r) => r.accountId));
    return rows.map((r) => ({
      id: r.id,
      status: r.status as AdminPhotoStatus,
      url: photoUrl(viewerId, r),
      mime: r.mime,
      width: r.width,
      height: r.height,
      position: r.position,
      createdAt: r.createdAt.toISOString(),
      owner: owners.get(r.accountId) ?? this.missing(r.accountId),
    }));
  }

  // ───────── Audit & stats ─────────

  async audit(q: AdminAuditQuery): Promise<AdminAuditPage> {
    const limit = Math.min(200, Math.max(1, q.limit ?? 50));
    const where: SQL[] = [];
    if (q.moderatorId) where.push(eq(t.moderationActions.moderatorId, q.moderatorId));
    if (q.subjectId) where.push(eq(t.moderationActions.subjectId, q.subjectId));
    if (q.action) where.push(eq(t.moderationActions.action, q.action));
    if (q.before) where.push(lt(t.moderationActions.createdAt, new Date(q.before)));
    const rows = await this.db
      .select()
      .from(t.moderationActions)
      .where(where.length ? and(...where) : undefined)
      .orderBy(desc(t.moderationActions.createdAt), desc(t.moderationActions.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    return {
      entries: await this.actionEntries(page),
      nextCursor: rows.length > limit ? page[page.length - 1]!.createdAt.toISOString() : null,
    };
  }

  async stats(): Promise<AdminStats> {
    const since = new Date(Date.now() - 7 * DAY_MS);
    const [openRows, [pending], actionRows, statusRows] = await Promise.all([
      this.db.select({ category: t.reports.category, n: count() }).from(t.reports).where(eq(t.reports.status, 'open')).groupBy(t.reports.category),
      this.db.select({ n: count() }).from(t.photos).where(eq(t.photos.status, 'pending')),
      this.db
        .select({ action: t.moderationActions.action, n: count() })
        .from(t.moderationActions)
        .where(gte(t.moderationActions.createdAt, since))
        .groupBy(t.moderationActions.action),
      this.db
        .select({ status: t.accounts.status, n: count() })
        .from(t.accounts)
        .where(inArray(t.accounts.status, ['suspended', 'banned']))
        .groupBy(t.accounts.status),
    ]);
    const openByPriority: Record<AdminReportPriority, number> = { p0: 0, p1: 0, p2: 0 };
    let openReports = 0;
    for (const r of openRows) {
      openByPriority[reportPriority(r.category)] += Number(r.n);
      openReports += Number(r.n);
    }
    const actionsByKind: AdminStats['actionsByKind'] = {};
    let actionsLast7Days = 0;
    for (const r of actionRows) {
      actionsByKind[r.action as ModerationActionKind] = Number(r.n);
      actionsLast7Days += Number(r.n);
    }
    const byStatus = new Map(statusRows.map((r) => [r.status, Number(r.n)]));
    return {
      openReports,
      openByPriority,
      pendingPhotos: Number(pending?.n ?? 0),
      actionsLast7Days,
      actionsByKind,
      suspendedAccounts: byStatus.get('suspended') ?? 0,
      bannedAccounts: byStatus.get('banned') ?? 0,
    };
  }
}

/** Signed, staff-bound URL for a photo (staff may load any photo; access is re-checked on every fetch). */
function photoUrl(viewerId: string, photo: Pick<PhotoRow, 'id'>): string {
  return photoPath(viewerId, photo.id);
}
