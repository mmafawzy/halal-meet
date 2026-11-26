import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, gte, inArray, isNull, lt, ne, or, sql } from 'drizzle-orm';
import {
  CORE_TOPIC_KEYS,
  QUESTIONS,
  QUESTIONS_BY_KEY,
  checkEligibility,
  computeCompatibility,
  type Answer,
  type EligibilityContext,
  type IncomingInterestsResponse,
  type InterestBody,
  type InterestResponse,
  type JourneyStage,
  type MatchSummary,
  type Message,
  type PassBody,
  type PendingGuardianApproval,
  type ProfileCard,
  type Usage,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { COUNTRIES } from '@halal-meet/core';
import { CountriesService } from './countries';
import { EntitlementsService } from './entitlements';
import { MembersService } from './members';
import { UsageService } from './usage';
import { FeedService } from './feed.service';
import { toProfileCard } from './compat';
import { goneIds, visibleIds } from './visibility';
import { activeGuardiansOf, approvalState, pendingFor, toPresence } from './guardian-gate';
import { detectRisk, type RiskWarning } from './risk';
import { DAY_MS } from '../common/time';
import { uuidv7 } from '../common/ids';
import { NotificationsService } from './notifications.service';

/** Message kind is free-form in the contract; system templates are stored as keys the client renders. */
export const SYSTEM_TEMPLATE = { respectfulClose: 'respectful_close' } as const;

@Injectable()
export class InteractionsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(FeedService) private readonly feed: FeedService,
    @Inject(CountriesService) private readonly countries: CountriesService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  // ───────── Interests ─────────

  async sendInterest(viewerId: string, body: InterestBody): Promise<InterestResponse> {
    if (body.toId === viewerId) throw new BadRequestException({ error: 'cannot_interest_self' });
    const viewer = await this.members.get(viewerId);
    if (!viewer) throw new BadRequestException({ error: 'profile_required' });
    const target = await this.members.get(body.toId);
    if (!target) throw new NotFoundException({ error: 'not_found' });
    // Hidden accounts (paused, incognito, deletion pending, suspended, banned) can't receive interests.
    if (!(await visibleIds(this.db, viewerId, [body.toId])).has(body.toId)) throw new NotFoundException({ error: 'not_found' });

    const usage = await this.usage.assertCanSendInterest(viewerId, viewer.row.country, body.level);

    // A Serious Interest note is available to free users; plain-interest notes need Plus+.
    if (body.level === 'interest' && body.note && viewer.row.profileStrength >= 0) {
      const { entitlements } = await this.entitlements.snapshot(viewerId);
      if (entitlements.tier === 'free' && body.note.trim().length > 0) {
        throw new ForbiddenException({ error: 'note_requires_plus' });
      }
    }

    const existing = await this.db
      .select()
      .from(t.interests)
      .where(and(eq(t.interests.fromId, viewerId), eq(t.interests.toId, body.toId)));
    if (existing[0]) throw new ConflictException({ error: 'already_sent' });

    const id = uuidv7();
    await this.db.insert(t.interests).values({
      id,
      fromId: viewerId,
      toId: body.toId,
      level: body.level,
      note: body.note ?? null,
      abymAnswers: body.abym ?? null,
      status: 'pending',
    });
    await this.usage.recordInterest(viewerId, body.level);

    // Mutual interest → match (stage 1, first message due in 7 days).
    const reciprocal = await this.db
      .select()
      .from(t.interests)
      .where(and(eq(t.interests.fromId, body.toId), eq(t.interests.toId, viewerId)));
    let matched = false;
    let matchId: string | null = null;
    if (reciprocal[0]) {
      matchId = await this.ensureMatch(viewerId, body.toId);
      matched = true;
      await this.db
        .update(t.interests)
        .set({ status: 'matched' })
        .where(and(inArray(t.interests.id, [id, reciprocal[0].id])));
    }
    if (matched) await Promise.all([this.notifications.notify(body.toId, 'match', { matchId, otherId: viewerId }), this.notifications.notify(viewerId, 'match', { matchId, otherId: body.toId, initiatedByYou: true })]);
    else await this.notifications.notify(body.toId, body.level === 'serious' ? 'serious_interest' : 'interest', { interestId: id, fromId: viewerId, level: body.level });
    this.feed.noteAction(viewerId);
    this.feed.noteAction(body.toId);

    return { matched, matchId, usage: await this.usage.usage(viewerId, viewer.row.country) };
  }

  /** Creates the match row if missing (order-independent pair key) and returns its id. */
  async ensureMatch(a: string, b: string, now = new Date()): Promise<string> {
    const [x, y] = a < b ? [a, b] : [b, a];
    const existing = await this.db
      .select()
      .from(t.matches)
      .where(and(eq(t.matches.aId, x!), eq(t.matches.bId, y!)));
    if (existing[0]) return existing[0].id;
    const id = uuidv7();
    await this.db.insert(t.matches).values({
      id,
      aId: x!,
      bId: y!,
      stage: 1,
      status: 'active',
      firstMessageDue: new Date(now.getTime() + 7 * DAY_MS),
    });
    return id;
  }

  async pass(viewerId: string, body: PassBody): Promise<void> {
    if (body.toId === viewerId) throw new BadRequestException({ error: 'cannot_pass_self' });
    await this.db
      .insert(t.passes)
      .values({ fromId: viewerId, toId: body.toId, reason: body.reason ?? null })
      .onConflictDoUpdate({ target: [t.passes.fromId, t.passes.toId], set: { reason: body.reason ?? null, undone: false, createdAt: new Date() } });
    this.feed.noteAction(viewerId);
  }

  async incoming(viewerId: string, now = new Date()): Promise<IncomingInterestsResponse> {
    const viewer = await this.members.get(viewerId, now);
    if (!viewer) throw new BadRequestException({ error: 'profile_required' });
    const { entitlements } = await this.entitlements.snapshot(viewerId, now);
    const rows = await this.db
      .select()
      .from(t.interests)
      .where(and(eq(t.interests.toId, viewerId), ne(t.interests.status, 'passed')))
      .orderBy(desc(t.interests.createdAt));

    const members = await this.members.getMany(rows.map((r) => r.fromId), now);
    const visibleSenders = await visibleIds(this.db, viewerId, rows.map((r) => r.fromId), now);
    const { countryStatus } = await this.countries.resolver();
    const ctx: EligibilityContext = { now, countryStatus };
    const scored = rows
      .map((r) => {
        const m = members.get(r.fromId);
        if (!m || !visibleSenders.has(m.id)) return null;
        if (!checkEligibility(viewer.match, m.match, ctx).ok) return null;
        return { row: r, member: m, compat: computeCompatibility(viewer.match, m.match) };
      })
      .filter((x): x is { row: typeof rows[number]; member: NonNullable<ReturnType<typeof members.get>>; compat: ReturnType<typeof computeCompatibility> } => !!x)
      .sort((a, b) => b.compat.overall - a.compat.overall);

    const highCompatCount = scored.filter((s) => s.compat.displayPct >= 85).length;
    // Free users see counts only; Serious Interest senders are always shown.
    const visible = entitlements.limits.incomingInterests === 'full' ? scored : scored.filter((s) => s.row.level === 'serious');
    const cards = visible.map((s) => ({
      ...toProfileCard(s.member, { tier: entitlements.tier, compat: s.compat, sentYouSeriousInterest: s.row.level === 'serious' }),
      level: s.row.level as 'interest' | 'serious',
      note: s.row.note,
    }));
    return { count: scored.length, highCompatCount, cards };
  }

  // ───────── Matches ─────────

  async listMatches(viewerId: string, now = new Date()): Promise<MatchSummary[]> {
    const viewer = await this.members.get(viewerId, now);
    if (!viewer) throw new BadRequestException({ error: 'profile_required' });
    const { entitlements } = await this.entitlements.snapshot(viewerId, now);
    const rows = await this.db
      .select()
      .from(t.matches)
      .where(or(eq(t.matches.aId, viewerId), eq(t.matches.bId, viewerId)))
      .orderBy(desc(t.matches.updatedAt));
    if (rows.length === 0) return [];

    const otherIds = rows.map((r) => (r.aId === viewerId ? r.bId : r.aId));
    const members = await this.members.getMany(otherIds, now);
    // Deleted / banned / deletion-pending accounts disappear from conversations too (paused ones stay).
    const gone = await goneIds(this.db, otherIds);
    const matchIds = rows.map((r) => r.id);

    const [lastMessages, coverage, myLast] = await Promise.all([
      this.db
        .select()
        .from(t.messages)
        .where(and(inArray(t.messages.matchId, matchIds), eq(t.messages.hidden, false)))
        .orderBy(desc(t.messages.sentAt)),
      this.db
        .select({ matchId: t.topicCoverage.matchId, topicKey: t.topicCoverage.topicKey })
        .from(t.topicCoverage)
        .where(inArray(t.topicCoverage.matchId, matchIds)),
      this.db
        .select({ matchId: t.messages.matchId, senderId: t.messages.senderId, sentAt: t.messages.sentAt })
        .from(t.messages)
        .where(and(inArray(t.messages.matchId, matchIds), eq(t.messages.hidden, false)))
        .orderBy(desc(t.messages.sentAt)),
    ]);

    const lastByMatch = new Map<string, Message>();
    for (const m of lastMessages) {
      if (!lastByMatch.has(m.matchId)) lastByMatch.set(m.matchId, this.toMessage(m, null));
    }
    const coverageByMatch = new Map<string, Set<string>>();
    for (const c of coverage) {
      const set = coverageByMatch.get(c.matchId) ?? new Set<string>();
      set.add(c.topicKey);
      coverageByMatch.set(c.matchId, set);
    }

    const guardians = await activeGuardiansOf(this.db, [viewerId, ...otherIds]);
    const out: MatchSummary[] = [];
    for (const r of rows) {
      const other = members.get(r.aId === viewerId ? r.bId : r.aId);
      if (!other || gone.has(other.id)) continue;
      const topics = coverageByMatch.get(r.id)?.size ?? 0;
      const last = lastByMatch.get(r.id) ?? null;
      const { stage, pending } = await this.journeyOf(r, topics, viewerId);
      out.push({
        matchId: r.id,
        other: toProfileCard(other, { tier: entitlements.tier, compat: computeCompatibility(viewer.match, other.match), viewerIsMatch: true }),
        stage,
        topicsCovered: topics,
        topicsTotal: CORE_TOPIC_KEYS.length || 15,
        lastMessage: last ? { body: last.body, at: last.sentAt, fromMe: last.senderId === viewerId } : null,
        yourMove: r.status === 'active' ? last?.senderId !== viewerId : false,
        firstMessageDue: r.firstMessageDue ? r.firstMessageDue.toISOString() : null,
        status: r.status === 'closed' ? 'closed' : 'active',
        guardians: { mine: toPresence(guardians.get(viewerId)), theirs: toPresence(guardians.get(other.id)) },
        pendingGuardianApproval: r.status === 'active' ? pending : null,
      });
    }
    void myLast;
    return out;
  }

  /**
   * Stage is derived from topic coverage plus mutual "ready" taps (spec 04 §6). Stages 5 and 6 also wait for an
   * approval from each person's approving guardian, if they have one (spec 01 §44).
   */
  private async journeyOf(
    match: { id: string; aId: string; bId: string; stage: number },
    topicsCovered: number,
    viewerId: string,
  ): Promise<{ stage: JourneyStage; pending: PendingGuardianApproval | null }> {
    const ready = await this.db
      .select({ stage: t.stageReadiness.stage, accountId: t.stageReadiness.accountId })
      .from(t.stageReadiness)
      .where(eq(t.stageReadiness.matchId, match.id));
    const bothReady = (stage: number) => new Set(ready.filter((r) => r.stage === stage).map((r) => r.accountId)).size >= 2;
    const anyReady = (stage: number) => ready.some((r) => r.stage === stage);
    const approvals = await approvalState(this.db, match);
    const viewerIsA = match.aId === viewerId;
    const stored = Math.min(match.stage, 6);

    let pending: PendingGuardianApproval | null = null;
    let stage: number = 1;
    const wants5 = topicsCovered >= 12 && bothReady(5);
    if (wants5 && approvals.approved(5)) stage = 5;
    else if (topicsCovered >= 8 && anyReady(4)) stage = 4;
    else if (topicsCovered >= 4 && anyReady(3)) stage = 3;
    else if (topicsCovered >= 2) stage = 2;
    if (wants5 && stored < 5 && !approvals.approved(5)) pending = pendingFor(viewerIsA, 5, approvals.waiting(5));

    // A stored stage is never lowered below what the taps prove.
    stage = Math.max(stage, stored);
    if (stage === 5 && bothReady(6)) {
      if (approvals.approved(6)) stage = 6;
      else pending = pendingFor(viewerIsA, 6, approvals.waiting(6));
    }
    return { stage: stage as JourneyStage, pending: stage >= 6 ? null : pending };
  }

  /** Re-evaluates and stores a match's stage (after a ready tap or a guardian approval). */
  async recomputeStage(matchId: string): Promise<JourneyStage> {
    const [match] = await this.db.select().from(t.matches).where(eq(t.matches.id, matchId));
    if (!match) throw new NotFoundException({ error: 'match_not_found' });
    const topics = await this.db.select({ n: count() }).from(t.topicCoverage).where(eq(t.topicCoverage.matchId, matchId));
    const { stage } = await this.journeyOf(match, Number(topics[0]?.n ?? 0), match.aId);
    if (stage > match.stage) await this.db.update(t.matches).set({ stage, updatedAt: new Date() }).where(eq(t.matches.id, matchId));
    return stage;
  }

  async messages(viewerId: string, matchId: string, before: string | undefined): Promise<Message[]> {
    const match = await this.requireMatch(viewerId, matchId);
    const otherId = match.aId === viewerId ? match.bId : match.aId;
    const rows = await this.db
      .select()
      .from(t.messages)
      .where(and(eq(t.messages.matchId, matchId), before ? lt(t.messages.sentAt, new Date(before)) : undefined))
      .orderBy(desc(t.messages.sentAt))
      .limit(50);
    const ordered = rows.reverse();
    const answers = await this.topicAnswersFor(ordered.map((m) => m.id));
    return ordered.map((m) => this.toMessage(m, this.topicAnswerView(m, answers, viewerId, otherId)));
  }

  async sendMessage(viewerId: string, matchId: string, body: { kind: 'text' | 'topic_card'; body?: string; topicKey?: string }): Promise<Message> {
    const match = await this.requireMatch(viewerId, matchId);
    if (match.status === 'closed') throw new ForbiddenException({ error: 'match_closed' });
    const otherId = match.aId === viewerId ? match.bId : match.aId;
    let text = (body.body ?? '').trim();
    let topicKey: string | null = null;
    if (body.kind === 'topic_card') {
      const q = body.topicKey ? QUESTIONS_BY_KEY[body.topicKey] : undefined;
      if (!q) throw new BadRequestException({ error: 'unknown_topic' });
      topicKey = q.key;
      text = q.text.en;
    }
    if (!text) throw new BadRequestException({ error: 'empty_message' });

    const risk: RiskWarning | null = body.kind === 'text' ? detectRisk(text) : null;
    const id = uuidv7();
    const [row] = await this.db
      .insert(t.messages)
      .values({ id, matchId, senderId: viewerId, kind: body.kind, body: text, topicKey, risk, sentAt: new Date() })
      .returning();
    await this.db.update(t.matches).set({ updatedAt: new Date() }).where(eq(t.matches.id, matchId));
    await this.notifications.notify(otherId, 'message', { matchId, messageId: id, senderId: viewerId });
    void otherId;
    return this.toMessage(row!, null);
  }

  async answerTopic(viewerId: string, matchId: string, messageId: string, value: string): Promise<Message> {
    const match = await this.requireMatch(viewerId, matchId);
    const otherId = match.aId === viewerId ? match.bId : match.aId;
    const [message] = await this.db
      .select()
      .from(t.messages)
      .where(and(eq(t.messages.id, messageId), eq(t.messages.matchId, matchId)));
    if (!message) throw new NotFoundException({ error: 'not_found' });
    if (message.kind !== 'topic_card' || !message.topicKey) throw new BadRequestException({ error: 'not_a_topic_card' });

    await this.db
      .insert(t.topicAnswers)
      .values({ messageId, accountId: viewerId, value })
      .onConflictDoUpdate({ target: [t.topicAnswers.messageId, t.topicAnswers.accountId], set: { value, answeredAt: new Date() } });

    const answers = await this.topicAnswersFor([messageId]);
    const both = (answers.get(messageId) ?? []).length >= 2;
    if (both) {
      const mine = (answers.get(messageId) ?? []).find((a) => a.accountId === viewerId)?.value;
      const theirs = (answers.get(messageId) ?? []).find((a) => a.accountId === otherId)?.value;
      const differs = !!mine && !!theirs && mine !== theirs;
      await this.db
        .insert(t.topicCoverage)
        .values({ matchId, topicKey: message.topicKey, differs, coveredAt: new Date() })
        .onConflictDoUpdate({ target: [t.topicCoverage.matchId, t.topicCoverage.topicKey], set: { differs, coveredAt: new Date() } });
    }
    return this.toMessage(message, this.topicAnswerView(message, answers, viewerId, otherId));
  }

  async stageReady(viewerId: string, matchId: string, stage: JourneyStage): Promise<void> {
    const match = await this.requireMatch(viewerId, matchId);
    if (match.status === 'closed') throw new ForbiddenException({ error: 'match_closed' });
    await this.db
      .insert(t.stageReadiness)
      .values({ matchId, accountId: viewerId, stage, readyAt: new Date() })
      .onConflictDoNothing();
    await this.recomputeStage(matchId);
  }

  /**
   * Close respectfully. The system message body is the template key `respectful_close`; the client renders
   * the EN/AR copy (spec 01 §40) so the two strings are never stored here.
   */
  async closeMatch(viewerId: string, matchId: string, body: { template: 'respectful_default' | 'custom'; message?: string; reason?: string }): Promise<void> {
    const match = await this.requireMatch(viewerId, matchId);
    const otherId = match.aId === viewerId ? match.bId : match.aId;
    await this.db
      .update(t.matches)
      .set({ status: 'closed', closedBy: viewerId, closeReason: body.reason ?? body.template, updatedAt: new Date() })
      .where(eq(t.matches.id, matchId));
    if (body.template === 'custom' && body.message?.trim()) {
      await this.db.insert(t.messages).values({
        id: uuidv7(),
        matchId,
        senderId: viewerId,
        kind: 'text',
        body: body.message.trim(),
        risk: null,
        sentAt: new Date(),
      });
    }
    await this.db.insert(t.messages).values({
      id: uuidv7(),
      matchId,
      senderId: null,
      kind: 'system',
      body: SYSTEM_TEMPLATE.respectfulClose,
      risk: null,
      sentAt: new Date(),
    });
    void otherId;
  }

  // ───────── Passport ─────────

  async passport(viewerId: string, now = new Date()) {
    const viewer = await this.members.get(viewerId, now);
    if (!viewer) throw new BadRequestException({ error: 'profile_required' });
    const { entitlements } = await this.entitlements.snapshot(viewerId, now);
    return {
      destinations: viewer.match.passport,
      entitlements: entitlements.passport,
      suggestions: await this.feed.suggestions(viewerId, now),
    };
  }

  async addPassportDestination(
    viewerId: string,
    body: { country: string; city?: string | null; isWorldwide?: boolean; purpose: string; visitFrom?: string | null; visitTo?: string | null },
    now = new Date(),
  ) {
    const viewer = await this.members.get(viewerId, now);
    if (!viewer) throw new BadRequestException({ error: 'profile_required' });
    if (!viewer.match.identityVerified) throw new ForbiddenException({ error: 'identity_verification_required' });

    const { entitlements } = await this.entitlements.snapshot(viewerId, now);
    const capacity = entitlements.passport.capacity;
    if (capacity <= 0) throw new ForbiddenException({ error: 'passport_required' });

    const existing = viewer.match.passport;
    if (existing.length >= capacity) throw new ForbiddenException({ error: 'passport_capacity_reached', capacity });
    if (existing.some((d) => d.country === body.country && d.purpose === body.purpose)) {
      throw new ConflictException({ error: 'destination_exists' });
    }
    if (body.isWorldwide && !entitlements.limits.passport.worldwide) {
      throw new ForbiddenException({ error: 'worldwide_requires_gold' });
    }
    if (!COUNTRIES.some((c) => c.code === body.country)) throw new BadRequestException({ error: 'unknown_country' });
    if (body.purpose === 'visiting' && !body.visitFrom) throw new BadRequestException({ error: 'visit_dates_required' });

    // Travel mode starts 14 days before arrival; otherwise the destination is live immediately.
    const visibleFrom = body.purpose === 'visiting' && body.visitFrom ? new Date(new Date(`${body.visitFrom}T00:00:00Z`).getTime() - 14 * DAY_MS) : now;
    const activeUntil = body.purpose === 'visiting' && body.visitTo ? new Date(`${body.visitTo}T23:59:59Z`) : (entitlements.passport.passExpiresAt ? new Date(entitlements.passport.passExpiresAt) : null);

    const id = uuidv7();
    const status = visibleFrom > now ? 'scheduled' : 'active';
    const source = entitlements.passport.source === 'none' ? 'pass' : entitlements.passport.source;
    await this.db.insert(t.passportDestinations).values({
      id,
      accountId: viewerId,
      country: body.country,
      city: body.city ?? null,
      isWorldwide: body.isWorldwide ?? false,
      purpose: body.purpose,
      visitFrom: body.visitFrom ?? null,
      visitTo: body.visitTo ?? null,
      visibleFrom,
      activeUntil,
      status,
      source,
    });
    this.feed.noteAction(viewerId);
    return { ok: true as const, id };
  }

  async removePassportDestination(viewerId: string, id: string): Promise<void> {
    const rows = await this.db
      .select()
      .from(t.passportDestinations)
      .where(and(eq(t.passportDestinations.id, id), eq(t.passportDestinations.accountId, viewerId)));
    if (!rows[0]) throw new NotFoundException({ error: 'not_found' });
    await this.db
      .update(t.passportDestinations)
      .set({ status: 'cancelled' })
      .where(eq(t.passportDestinations.id, id));
    this.feed.noteAction(viewerId);
  }

  // ───────── Profile view ─────────

  async profileCard(viewerId: string, id: string, now = new Date()): Promise<ProfileCard> {
    const viewer = await this.members.get(viewerId, now);
    if (!viewer) throw new BadRequestException({ error: 'profile_required' });
    const target = await this.members.get(id, now);
    if (!target) throw new NotFoundException({ error: 'not_found' });
    const { entitlements } = await this.entitlements.snapshot(viewerId, now);

    const matched = await this.db
      .select()
      .from(t.matches)
      .where(or(and(eq(t.matches.aId, viewerId), eq(t.matches.bId, id)), and(eq(t.matches.aId, id), eq(t.matches.bId, viewerId))));
    const isMatch = matched.length > 0;
    // Matches keep seeing each other (even paused or incognito) unless the account is gone; everyone else
    // only sees visible accounts. Hidden accounts answer 404, so their existence isn't revealed.
    if (isMatch ? (await goneIds(this.db, [id])).has(id) : !(await visibleIds(this.db, viewerId, [id], now)).has(id)) {
      throw new NotFoundException({ error: 'not_found' });
    }
    if (!isMatch) {
      const { countryStatus } = await this.countries.resolver();
      const ctx: EligibilityContext = { now, countryStatus };
      if (!checkEligibility(viewer.match, target.match, ctx).ok) throw new ForbiddenException({ error: 'not_eligible' });
    }
    const serious = await this.db
      .select({ level: t.interests.level })
      .from(t.interests)
      .where(and(eq(t.interests.fromId, id), eq(t.interests.toId, viewerId), eq(t.interests.level, 'serious')));
    return toProfileCard(target, {
      tier: entitlements.tier,
      compat: computeCompatibility(viewer.match, target.match),
      viewerIsMatch: isMatch,
      sentYouSeriousInterest: serious.length > 0,
      isNew: target.createdAt.getTime() > now.getTime() - 7 * DAY_MS,
    });
  }

  // ───────── helpers ─────────

  private async requireMatch(viewerId: string, matchId: string) {
    const rows = await this.db
      .select()
      .from(t.matches)
      .where(and(eq(t.matches.id, matchId), or(eq(t.matches.aId, viewerId), eq(t.matches.bId, viewerId))));
    if (!rows[0]) throw new NotFoundException({ error: 'not_found' });
    return rows[0];
  }

  private async topicAnswersFor(messageIds: string[]) {
    const map = new Map<string, Array<{ accountId: string; value: string }>>();
    if (messageIds.length === 0) return map;
    const rows = await this.db.select().from(t.topicAnswers).where(inArray(t.topicAnswers.messageId, messageIds));
    for (const r of rows) {
      const list = map.get(r.messageId) ?? [];
      list.push({ accountId: r.accountId, value: r.value });
      map.set(r.messageId, list);
    }
    return map;
  }

  private topicAnswerView(
    message: typeof t.messages.$inferSelect,
    answers: Map<string, Array<{ accountId: string; value: string }>>,
    viewerId: string,
    otherId: string,
  ): Message['topicAnswers'] {
    if (message.kind !== 'topic_card') return null;
    const list = answers.get(message.id) ?? [];
    const mine = list.find((a) => a.accountId === viewerId)?.value ?? null;
    const theirs = list.find((a) => a.accountId === otherId)?.value ?? null;
    // Both answers are revealed only once both have answered.
    const revealed = mine !== null && theirs !== null;
    return { mine, theirs: revealed ? theirs : null, revealed };
  }

  private toMessage(row: typeof t.messages.$inferSelect, topicAnswers: Message['topicAnswers']): Message {
    return {
      id: row.id,
      matchId: row.matchId,
      senderId: row.senderId,
      kind: row.kind as Message['kind'],
      body: row.body,
      topicKey: row.topicKey,
      topicAnswers,
      sentAt: row.sentAt.toISOString(),
      risk: row.risk ? { warning: row.risk as RiskWarning } : null,
    };
  }

  /** Answers of a match partner for "key facts" style displays (unused hook kept for expansion). */
  async answersOf(accountId: string): Promise<Answer[]> {
    const rows = await this.db.select().from(t.answers).where(eq(t.answers.accountId, accountId));
    return rows.map((r) => ({ questionKey: r.questionKey, self: r.selfValue ?? null, accept: r.partnerAccept ?? null, importance: r.importance }));
  }

  /** Total unanswered topics for a match (used by stage computation helpers/tests). */
  async uncoveredTopics(matchId: string): Promise<string[]> {
    const rows = await this.db.select({ topicKey: t.topicCoverage.topicKey }).from(t.topicCoverage).where(eq(t.topicCoverage.matchId, matchId));
    const covered = new Set(rows.map((r) => r.topicKey));
    return CORE_TOPIC_KEYS.filter((k) => !covered.has(k));
  }
}

void randomUUID;
void asc;
void gte;
void isNull;
void lt;
void ne;
void sql;
void QUESTIONS;
