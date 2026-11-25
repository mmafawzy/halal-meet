import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  CORE_TOPIC_KEYS,
  COUNTRIES,
  checkEligibility,
  computeCompatibility,
  DEFAULT_QUALITY_FLOOR,
  exposureMultiplier,
  regionOf,
  rankScore,
  type CompatibilityResult,
  type Dimension,
  type EligibilityContext,
  type FeedItem,
  type FeedPage,
  type FeedScope,
  type FeedSlot,
  type CountryStatus,
  type MatchProfile,
  type PlanTier,
  type ProfileCard,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { CountriesService } from './countries';
import { EntitlementsService } from './entitlements';
import { MembersService, uniq, type Member } from './members';
import { UsageService } from './usage';
import { toProfileCard } from './compat';
import { DAY_MS } from '../common/time';

export const PAGE_SIZE = 20;
const QUEUE_TTL_MS = 6 * 3_600_000; // spec 04 §4.1: queue refreshed every 6 h
const QUEUE_TARGET = 500;
const NEW_MEMBER_DAYS = 14;
const PASS_EXCLUSION_DAYS = 90;
const MINDFUL_BROWSING_AFTER = 60;

export interface RankedCandidate {
  member: Member;
  compat: CompatibilityResult;
  score: number;
  displayPct: number;
  slot: FeedSlot;
}

interface QueueEntry {
  createdAt: number;
  ranked: RankedCandidate[];
  pinned: RankedCandidate[];
  inbound: RankedCandidate[];
  fresh: RankedCandidate[];
  explore: RankedCandidate[];
  token: string;
}

interface SessionState {
  id: string;
  viewerId: string;
  token: string;
  offset: number;
  interests: number;
  cards: number;
  startedAt: number;
}

interface CursorPayload {
  v: 1;
  sid: string;
  o: number;
  t: string;
  vw: string;
}

@Injectable()
export class FeedService {
  /**
   * Per-viewer ranked queue + session state, in memory. Stands in for the Redis candidate queue and
   * live impression counters of spec 04 §4.1/§4.5; `feed_impressions` is still written for audits.
   */
  private queues = new Map<string, QueueEntry>();
  private impressions = new Map<string, { day: string; count: number }>();
  private sessions = new Map<string, SessionState>();
  /** Country statuses (cached), refreshed at the start of every request that needs them. */
  private statuses = new Map<string, CountryStatus>();
  private statusesAt = 0;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(CountriesService) private readonly countries: CountriesService,
  ) {}

  /** Drops cached queues (preferences or answers changed, interest/pass sent). */
  invalidate(viewerId?: string): void {
    if (viewerId) this.queues.delete(viewerId);
    else this.queues.clear();
  }

  // ───────── Feed page ─────────

  async page(viewerId: string, cursor: string | undefined, now = new Date()): Promise<FeedPage> {
    await this.refreshStatuses();
    const viewer = await this.members.get(viewerId, now);
    if (!viewer) throw new Error('profile_required');
    const { entitlements } = await this.entitlements.snapshot(viewerId, now);

    let session: SessionState;
    let offset = 0;
    if (cursor) {
      const decoded = this.decodeCursor(viewerId, cursor);
      offset = decoded.o;
      const existing = this.sessions.get(decoded.sid);
      session = existing
        ? existing
        : { id: decoded.sid, viewerId, token: decoded.t, offset, interests: 0, cards: decoded.o, startedAt: Date.now() };
      this.sessions.set(decoded.sid, session);
    } else {
      session = { id: randomUUID(), viewerId, token: '', offset: 0, interests: 0, cards: 0, startedAt: Date.now() };
      this.sessions.set(session.id, session);
    }

    const entry = await this.getQueue(viewer, entitlements.tier, now, session.id);
    if (session.token && session.token !== entry.token) {
      // The queue was rebuilt (interest/pass/preference change): restart the session from the top.
      return this.page(viewerId, undefined, now);
    }
    session.token = entry.token;

    const previousVisit = await this.readLastVisit(viewerId);

    // Exclude today's Top Picks from the feed (spec 04 §4.3).
    const pickIds = new Set(await this.topPickIdsToday(viewerId, now));
    const ordered = this.orderForPage(entry).filter((c) => !pickIds.has(c.member.id));
    const slice = ordered.slice(offset, offset + PAGE_SIZE);

    const seriousSenders = await this.seriousSendersTo(viewerId);
    const lastVisitMs = previousVisit?.getTime() ?? 0;
    const items: FeedItem[] = slice.map((c) => ({
      type: 'profile',
      slot: c.slot,
      card: toProfileCard(c.member, {
        tier: entitlements.tier,
        compat: c.compat,
        isNew: c.member.createdAt.getTime() >= lastVisitMs,
        sentYouSeriousInterest: seriousSenders.has(c.member.id),
      }),
    }));

    let page = this.insertDivider(items);
    page = this.insertInline(page, viewer, slice, session, offset);
    const usage = await this.usage.usage(viewerId, viewer.row.country, now);
    if (entitlements.tier === 'free' && !page.some((i) => i.type === 'inline' && i.kind === 'upsell')) {
      // At most one upsell per page, only once the free user is close to their daily cap.
      if (usage.interestsLimit !== null && usage.interestsToday >= Math.max(1, usage.interestsLimit - 2)) {
        page.splice(Math.min(6, page.length), 0, {
          type: 'inline',
          kind: 'upsell',
          sku: 'plus_monthly',
          reason: 'interests',
        });
      }
    }

    this.recordImpressions(viewerId, session, slice, now);
    session.cards += slice.length;
    session.offset = offset + slice.length;
    await this.touchLastVisit(viewerId, now);

    const endOfPool = offset + PAGE_SIZE >= ordered.length;
    const newSinceLastVisit = await this.countNewSince(viewer, previousVisit, now);
    return {
      items: page,
      nextCursor: endOfPool ? null : this.encodeCursor(session, offset + PAGE_SIZE),
      endOfPool,
      newSinceLastVisit,
      scope: this.scope(viewer),
      passportSuggestions: await this.passportSuggestions(viewer, entitlements.tier, now),
    };
  }

  /** Called when the viewer sends an interest/pass so the queue re-ranks before the next page. */
  noteAction(viewerId: string): void {
    this.invalidate(viewerId);
  }

  // ───────── Queue ─────────

  private async getQueue(viewer: Member, tier: PlanTier, now: Date, sessionId?: string): Promise<QueueEntry> {
    const cached = this.queues.get(viewer.id);
    if (cached && Date.now() - cached.createdAt < QUEUE_TTL_MS) return cached;
    const entry = await this.buildQueue(viewer, tier, now, sessionId);
    this.queues.set(viewer.id, entry);
    return entry;
  }

  /** SQL pre-filter → eligibility → compatibility → ranking → slot queues (spec 04 §1, §3, §4). */
  async buildQueue(viewer: Member, _tier: PlanTier, now: Date, sessionId?: string): Promise<QueueEntry> {
    await this.refreshStatuses();
    const ctx: EligibilityContext = { now, countryStatus: (c) => this.statuses.get(c) ?? 'growing' };
    const viewerMatch = viewer.match;

    const scopeCountries = this.scopeFor(viewerMatch).countries;
    const candidateIds = await this.candidatesByLocation(viewer, scopeCountries, now);
    const all =
      candidateIds.length > 0
        ? await this.members.load(and(inArray(t.profiles.accountId, candidateIds), eq(t.accounts.status, 'active')), now)
        : [];

    const [passed, interested, matched, blocked, seen, seriousSenders, pending, responsiveness] = await Promise.all([
      this.recentPasses(viewer.id, now),
      this.existingInterests(viewer.id),
      this.existingMatches(viewer.id),
      this.blocks(viewer.id),
      this.seenThisSession(viewer.id, sessionId),
      this.seriousSendersTo(viewer.id),
      this.usage.pendingInbound(all.map((c) => c.id)),
      this.responsiveness(all.map((c) => c.id)),
    ]);

    const ranked: RankedCandidate[] = [];
    for (const c of all) {
      if (c.id === viewer.id) continue;
      if (passed.has(c.id) || interested.has(c.id) || matched.has(c.id) || blocked.has(c.id)) continue;
      if (seen.has(c.id) && !seriousSenders.has(c.id)) continue;
      if (!checkEligibility(viewerMatch, c.match, ctx).ok) continue;
      const compat = computeCompatibility(viewerMatch, c.match);
      ranked.push({
        member: c,
        compat,
        displayPct: compat.displayPct,
        slot: 'core',
        score: this.score(viewer, c, compat, responsiveness.get(c.id) ?? 0.5, pending.get(c.id) ?? 0, now),
      });
    }
    ranked.sort((a, b) => b.score - a.score);

    const byId = new Map(ranked.map((r) => [r.member.id, r]));
    const taken = new Set<string>();
    const take = (list: RankedCandidate[], n: number, slot: FeedSlot): RankedCandidate[] => {
      const out: RankedCandidate[] = [];
      for (const c of list) {
        if (out.length >= n) break;
        if (taken.has(c.member.id)) continue;
        taken.add(c.member.id);
        out.push({ ...c, slot });
      }
      return out;
    };

    const pinned = take(
      [...seriousSenders].map((id) => byId.get(id)).filter((r): r is RankedCandidate => !!r),
      5,
      'pinned_serious',
    );
    const inboundIds = await this.inboundInterested(viewer.id);
    const inbound = take(
      inboundIds.map((id) => byId.get(id)).filter((r): r is RankedCandidate => !!r),
      4,
      'inbound',
    );
    const freshCutoff = now.getTime() - NEW_MEMBER_DAYS * DAY_MS;
    const fresh = take(
      ranked.filter((r) => r.member.createdAt.getTime() >= freshCutoff),
      4,
      'new_member',
    );
    const explore = take(
      ranked
        .filter((r) => r.member.row.city !== viewer.row.city && r.displayPct >= DEFAULT_QUALITY_FLOOR)
        .sort((a, b) => b.displayPct - a.displayPct || b.score - a.score),
      2,
      'explore',
    );

    const core = ranked.filter((r) => !taken.has(r.member.id)).slice(0, QUEUE_TARGET);
    return { createdAt: Date.now(), ranked: core, pinned, inbound, fresh, explore, token: randomUUID() };
  }

  /**
   * Pinned serious-interest senders first, then the core queue with ~10% inbound / new / exploration
   * cards mixed in (spec 04 §4.2).
   */
  private orderForPage(entry: QueueEntry): RankedCandidate[] {
    const extras = [...entry.inbound, ...entry.fresh, ...entry.explore];
    const core = entry.ranked;
    const out: RankedCandidate[] = [];
    let e = 0;
    for (let i = 0; i < core.length; i++) {
      // Insert an extra card every ~7 core cards, never first.
      if (i > 0 && i % 7 === 4 && e < extras.length) out.push(extras[e++]!);
      out.push(core[i]!);
    }
    while (e < extras.length) out.push(extras[e++]!);
    return dedupeById([...entry.pinned, ...out]);
  }

  private score(viewer: Member, candidate: Member, compat: CompatibilityResult, responsiveness: number, pendingInbound: number, now: Date): number {
    const exposure = exposureMultiplier({ impressionsToday: this.impressionCount(candidate.id, now), pendingInbound });
    const ageDays = (now.getTime() - candidate.createdAt.getTime()) / DAY_MS;
    const activeRecently = !!candidate.lastActiveAt && now.getTime() - candidate.lastActiveAt.getTime() < 3 * DAY_MS;
    const freshness = Math.max(0, 1 - ageDays / 60) * (activeRecently ? 1 : 0.7);
    const verification = Math.min(1, candidate.verifications.length / 4);
    const completeness = candidate.row.profileStrength / 100;
    const pMutual = pMutualOf(viewer.match, candidate.match, compat, candidate.createdAt, now);
    return rankScore({ overall: compat.overall, pMutual, responsiveness, freshness, verification, completeness, penalty: 0 }) * exposure;
  }

  /** Reply/close rate over the last 30 days, as a rough Responsiveness signal (spec 04 §3). */
  private async responsiveness(ids: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (ids.length === 0) return out;
    const rows = await this.db
      .select({ aId: t.matches.aId, bId: t.matches.bId, status: t.matches.status })
      .from(t.matches)
      .where(and(or(inArray(t.matches.aId, ids), inArray(t.matches.bId, ids)), gt(t.matches.createdAt, new Date(Date.now() - 30 * DAY_MS))));
    const acc = new Map<string, { total: number; active: number }>();
    for (const r of rows) {
      for (const id of [r.aId, r.bId]) {
        if (!ids.includes(id)) continue;
        const cur = acc.get(id) ?? { total: 0, active: 0 };
        cur.total++;
        if (r.status === 'active') cur.active++;
        acc.set(id, cur);
      }
    }
    for (const [id, v] of acc) out.set(id, v.total === 0 ? 0.5 : Math.min(1, v.active / v.total));
    for (const id of ids) if (!out.has(id)) out.set(id, 0.5);
    return out;
  }

  // ───────── Candidate pre-filter ─────────

  /** Home country, home region while Growing, Passport destinations, plus foreign Passport holders covering the viewer. */
  private async candidatesByLocation(viewer: Member, scopeCountries: string[], now: Date): Promise<string[]> {
    const foreign = await this.db
      .select({ accountId: t.passportDestinations.accountId })
      .from(t.passportDestinations)
      .where(
        and(
          ne(t.passportDestinations.accountId, viewer.id),
          ne(t.passportDestinations.status, 'cancelled'),
          or(isNull(t.passportDestinations.activeUntil), gt(t.passportDestinations.activeUntil, now)),
          or(isNull(t.passportDestinations.visibleFrom), sql`${t.passportDestinations.visibleFrom} <= ${now}`),
          or(eq(t.passportDestinations.country, viewer.row.country), eq(t.passportDestinations.isWorldwide, true)),
        ),
      );
    const foreignIds = uniq(foreign.map((f) => f.accountId)).filter((id) => id !== viewer.id);
    const rows = await this.db
      .select({ accountId: t.profiles.accountId })
      .from(t.profiles)
      .where(
        and(
          ne(t.profiles.accountId, viewer.id),
          ne(t.profiles.gender, viewer.match.gender),
          or(inArray(t.profiles.country, scopeCountries), foreignIds.length ? inArray(t.profiles.accountId, foreignIds) : undefined),
        ),
      );
    return uniq(rows.map((r) => r.accountId));
  }

  /** Countries in scope: home, whole region while the home country is Growing, Passport destinations. */
  private scopeFor(viewer: MatchProfile): { countries: string[]; kind: FeedScope['kind'] } {
    const status = (c: string): CountryStatus => this.statuses.get(c) ?? 'growing';
    const set = new Set<string>([viewer.country]);
    const homeGrowing = status(viewer.country) === 'growing';
    if (homeGrowing) for (const c of COUNTRIES) if (c.region === regionOf(viewer.country)) set.add(c.code);
    for (const p of viewer.passport) {
      if (p.status === 'expired' || p.status === 'cancelled') continue;
      if (p.isWorldwide) for (const c of COUNTRIES) set.add(c.code);
      else set.add(p.country);
    }
    const hasPassport = viewer.passport.some((p) => p.status !== 'expired' && p.status !== 'cancelled');
    const kind: FeedScope['kind'] = hasPassport && set.size > 1 ? 'passport' : homeGrowing && set.size > 1 ? 'region' : 'country';
    return { countries: [...set], kind };
  }

  private scope(viewer: Member): FeedScope {
    const { countries, kind } = this.scopeFor(viewer.match);
    return {
      kind,
      countries,
      region: countries.length > 1 ? regionOf(viewer.row.country) : null,
      countryStatus: this.statuses.get(viewer.row.country) ?? 'growing',
    };
  }

  // ───────── Exclusions ─────────

  private async recentPasses(viewerId: string, now: Date): Promise<Set<string>> {
    const rows = await this.db
      .select({ toId: t.passes.toId })
      .from(t.passes)
      .where(and(eq(t.passes.fromId, viewerId), eq(t.passes.undone, false), gt(t.passes.createdAt, new Date(now.getTime() - PASS_EXCLUSION_DAYS * DAY_MS))));
    return new Set(rows.map((r) => r.toId));
  }

  private async existingInterests(viewerId: string): Promise<Set<string>> {
    const rows = await this.db.select({ toId: t.interests.toId }).from(t.interests).where(eq(t.interests.fromId, viewerId));
    return new Set(rows.map((r) => r.toId));
  }

  private async existingMatches(viewerId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ aId: t.matches.aId, bId: t.matches.bId })
      .from(t.matches)
      .where(or(eq(t.matches.aId, viewerId), eq(t.matches.bId, viewerId)));
    return new Set(rows.map((r) => (r.aId === viewerId ? r.bId : r.aId)));
  }

  private async blocks(viewerId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ blockerId: t.blocks.blockerId, blockedId: t.blocks.blockedId })
      .from(t.blocks)
      .where(or(eq(t.blocks.blockerId, viewerId), eq(t.blocks.blockedId, viewerId)));
    return new Set(rows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));
  }

  /**
   * Cards already shown in this browsing session are never repeated (spec 04 §4.1). Candidates viewed but
   * not acted on can resurface in a later session; passes are excluded for 90 days.
   */
  private async seenThisSession(viewerId: string, sessionId: string | undefined): Promise<Set<string>> {
    if (!sessionId) return new Set();
    const rows = await this.db
      .select({ candidateId: t.feedImpressions.candidateId })
      .from(t.feedImpressions)
      .where(and(eq(t.feedImpressions.viewerId, viewerId), eq(t.feedImpressions.sessionId, sessionId)));
    return new Set(rows.map((r) => r.candidateId));
  }

  private async seriousSendersTo(viewerId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ fromId: t.interests.fromId })
      .from(t.interests)
      .where(and(eq(t.interests.toId, viewerId), eq(t.interests.level, 'serious'), eq(t.interests.status, 'pending')));
    return new Set(rows.map((r) => r.fromId));
  }

  private async inboundInterested(viewerId: string): Promise<string[]> {
    const rows = await this.db
      .select({ fromId: t.interests.fromId })
      .from(t.interests)
      .where(and(eq(t.interests.toId, viewerId), eq(t.interests.status, 'pending')))
      .orderBy(desc(t.interests.createdAt))
      .limit(50);
    return rows.map((r) => r.fromId);
  }

  // ───────── Impressions ─────────

  private impressionCount(candidateId: string, now: Date): number {
    const e = this.impressions.get(candidateId);
    return e && e.day === now.toISOString().slice(0, 10) ? e.count : 0;
  }

  private recordImpressions(viewerId: string, session: SessionState, slice: RankedCandidate[], now: Date): void {
    if (slice.length === 0) return;
    const day = now.toISOString().slice(0, 10);
    const sessionId = session.id;
    void this.db
      .insert(t.feedImpressions)
      .values(
        slice.map((c, i) => ({
          id: randomUUID(),
          viewerId,
          candidateId: c.member.id,
          sessionId,
          position: i,
          slot: c.slot,
          rankScore: c.score,
          displayPct: c.displayPct,
          shownAt: now,
        })),
      )
      .catch(() => undefined);
    for (const c of slice) {
      const cur = this.impressions.get(c.member.id);
      if (cur && cur.day === day) cur.count++;
      else this.impressions.set(c.member.id, { day, count: 1 });
    }
  }

  // ───────── Inline items & dividers ─────────

  private insertDivider(items: FeedItem[]): FeedItem[] {
    const out: FeedItem[] = [];
    let done = false;
    for (const item of items) {
      if (!done && item.type === 'profile' && item.card.compatibility.displayPct < DEFAULT_QUALITY_FLOOR) {
        out.push({ type: 'divider', kind: 'broader_matches' });
        done = true;
        out.push({ ...item, slot: 'broader' });
        continue;
      }
      out.push(item);
    }
    return out;
  }

  private insertInline(items: FeedItem[], viewer: Member, slice: RankedCandidate[], session: SessionState, offset: number): FeedItem[] {
    const out = [...items];
    const insertAt = (index: number, item: FeedItem) => out.splice(Math.min(Math.max(index, 1), out.length), 0, item);
    const answered = new Set(viewer.match.answers.map((a) => a.questionKey));

    // ~1 inline card per 12 profiles, never adjacent and never first (spec 04 §4.2).
    const unanswered = CORE_TOPIC_KEYS.filter((k) => !answered.has(k));
    if (slice.length >= 12 && unanswered.length) {
      insertAt(11, { type: 'inline', kind: 'daily_question', questionKey: unanswered[offset % unanswered.length]! });
    }
    // Compatibility Reveal hook for the largest still-locked dimension.
    const locked = lockedDimension(slice[0]?.compat, answered);
    if (slice.length >= 6 && locked) {
      insertAt(7, { type: 'inline', kind: 'reveal', dimension: locked.dimension, questionsNeeded: locked.questionsNeeded });
    }
    // Mindful browsing after 60 cards with no interest sent in the session.
    if (session.cards >= MINDFUL_BROWSING_AFTER && session.interests === 0) {
      out.splice(Math.min(3, out.length), 0, { type: 'inline', kind: 'mindful_browsing' });
    }
    return out;
  }

  // ───────── End of pool ─────────

  private async countNewSince(viewer: Member, since: Date | null, now: Date): Promise<number> {
    if (!since) return 0;
    const rows = await this.db
      .select({ n: sql<number>`count(*)` })
      .from(t.profiles)
      .innerJoin(t.accounts, eq(t.accounts.id, t.profiles.accountId))
      .where(
        and(
          inArray(t.profiles.country, this.scopeFor(viewer.match).countries),
          ne(t.profiles.gender, viewer.match.gender),
          ne(t.profiles.accountId, viewer.id),
          gt(t.profiles.createdAt, since),
          eq(t.accounts.status, 'active'),
        ),
      );
    void now;
    return Number(rows[0]?.n ?? 0);
  }

  /**
   * Top countries by compatible count the user cannot currently see (spec 04 §4.6, 01 §71).
   * Counts are what the user *would* see with a Passport for that country: eligibility is evaluated as if
   * the viewer held a Passport destination there, so the numbers stay honest (never inflated).
   */
  private async passportSuggestions(viewer: Member, _tier: PlanTier, now: Date): Promise<Array<{ country: string; compatibleCount: number }>> {
    const inScope = new Set(this.scopeFor(viewer.match).countries);
    const all = await this.members.load(
      and(ne(t.profiles.accountId, viewer.id), ne(t.profiles.gender, viewer.match.gender), eq(t.accounts.status, 'active')),
      now,
    );
    const pending = await this.usage.pendingInbound([viewer.id]);
    void pending;
    const counts = new Map<string, number>();
    for (const c of all) {
      if (inScope.has(c.row.country)) continue;
      const viewerWithPassport: MatchProfile = {
        ...viewer.match,
        passport: [
          ...viewer.match.passport,
          {
            id: 'suggestion',
            country: c.row.country,
            city: null,
            purpose: 'relocate',
            visitFrom: null,
            visitTo: null,
            visibleFrom: now.toISOString(),
            activeUntil: null,
            status: 'active',
            isWorldwide: false,
          },
        ],
        // International visibility requires an ID-verified account (spec 04 §1.1); unverified users see no counts.
        identityVerified: viewer.match.identityVerified,
      };
      const ctx: EligibilityContext = { now, countryStatus: (x) => this.statuses.get(x) ?? 'growing' };
      if (!checkEligibility(viewerWithPassport, c.match, ctx).ok) continue;
      counts.set(c.row.country, (counts.get(c.row.country) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([country, compatibleCount]) => ({ country, compatibleCount }))
      .sort((a, b) => b.compatibleCount - a.compatibleCount)
      .slice(0, 5);
  }

  // ───────── Visits ─────────

  private async readLastVisit(viewerId: string): Promise<Date | null> {
    const rows = await this.db.select({ lastFeedVisitAt: t.accounts.lastFeedVisitAt }).from(t.accounts).where(eq(t.accounts.id, viewerId));
    return rows[0]?.lastFeedVisitAt ?? null;
  }

  private async touchLastVisit(viewerId: string, now: Date): Promise<void> {
    await this.db.update(t.accounts).set({ lastFeedVisitAt: now, lastActiveAt: now }).where(eq(t.accounts.id, viewerId));
  }

  /** Public wrapper: countries with live compatible counts the user cannot currently see. */
  async suggestions(viewerId: string, now = new Date()): Promise<Array<{ country: string; compatibleCount: number }>> {
    await this.refreshStatuses();
    const viewer = await this.members.get(viewerId, now);
    if (!viewer) return [];
    const { entitlements } = await this.entitlements.snapshot(viewerId, now);
    return this.passportSuggestions(viewer, entitlements.tier, now);
  }

  // ───────── Top Picks ─────────

  async topPicks(viewerId: string, now = new Date()): Promise<{ cards: ProfileCard[]; refreshesAt: string }> {
    await this.refreshStatuses();
    const viewer = await this.members.get(viewerId, now);
    if (!viewer) throw new Error('profile_required');
    const { entitlements } = await this.entitlements.snapshot(viewerId, now);
    const day = now.toISOString().slice(0, 10);

    let picks = await this.picksFor(viewerId, day);
    if (picks.length === 0) {
      const entry = await this.getQueue(viewer, entitlements.tier, now, undefined);
      const chosen = dedupeById([...entry.pinned, ...entry.ranked])
        .filter((c) => c.displayPct >= DEFAULT_QUALITY_FLOOR && c.member.match.identityVerified && c.member.row.profileStrength >= 70)
        .sort((a, b) => b.compat.overall * pMutualOf(viewer.match, b.member.match, b.compat, b.member.createdAt, now) - a.compat.overall * pMutualOf(viewer.match, a.member.match, a.compat, a.member.createdAt, now))
        .slice(0, entitlements.limits.topPicksPerDay);
      if (chosen.length) {
        await this.db
          .insert(t.topPicks)
          .values(chosen.map((c, i) => ({ accountId: viewerId, pickDate: day, candidateId: c.member.id, position: i + 1, source: 'algo' })))
          .onConflictDoNothing();
      }
      picks = await this.picksFor(viewerId, day);
    }

    const members = await this.members.getMany(picks.map((p) => p.candidateId), now);
    const cards: ProfileCard[] = [];
    for (const p of picks) {
      const m = members.get(p.candidateId);
      if (!m) continue;
      cards.push(toProfileCard(m, { tier: entitlements.tier, compat: computeCompatibility(viewer.match, m.match) }));
    }
    return { cards, refreshesAt: nextRefresh(now) };
  }

  async topPickIdsToday(viewerId: string, now = new Date()): Promise<string[]> {
    return (await this.picksFor(viewerId, now.toISOString().slice(0, 10))).map((p) => p.candidateId);
  }

  private async picksFor(viewerId: string, day: string) {
    return this.db
      .select()
      .from(t.topPicks)
      .where(and(eq(t.topPicks.accountId, viewerId), eq(t.topPicks.pickDate, day)))
      .orderBy(t.topPicks.position);
  }

  // ───────── Cursor & sessions ─────────

  private encodeCursor(session: SessionState, offset: number): string {
    const payload: CursorPayload = { v: 1, sid: session.id, o: offset, t: session.token, vw: session.viewerId };
    return Buffer.from(JSON.stringify(payload)).toString('base64url');
  }

  private decodeCursor(viewerId: string, cursor: string): CursorPayload {
    let parsed: CursorPayload;
    try {
      parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as CursorPayload;
    } catch {
      throw new Error('invalid_cursor');
    }
    if (parsed.v !== 1 || parsed.vw !== viewerId || typeof parsed.sid !== 'string') throw new Error('invalid_cursor');
    return parsed;
  }

  /** Refreshes the cached country statuses used by the scope/eligibility helpers (60 s TTL). */
  async refreshStatuses(force = false): Promise<void> {
    if (!force && Date.now() - this.statusesAt < 60_000 && this.statuses.size > 0) return;
    const { countryStatus } = await this.countries.resolver();
    for (const c of COUNTRIES) this.statuses.set(c.code, countryStatus(c.code));
    this.statusesAt = Date.now();
  }
}

// ───────── helpers ─────────

function dedupeById(list: RankedCandidate[]): RankedCandidate[] {
  const seen = new Set<string>();
  const out: RankedCandidate[] = [];
  for (const c of list) {
    if (seen.has(c.member.id)) continue;
    seen.add(c.member.id);
    out.push(c);
  }
  return out;
}

/** V1 P_mutual heuristic (spec 04 §3.1: no appearance signals, only compatibility + recency + behaviour priors). */
function pMutualOf(viewer: MatchProfile, candidate: MatchProfile, compat: CompatibilityResult, candidateCreatedAt: Date, now: Date): number {
  let p = 0.25 + 0.5 * compat.overall;
  p *= 1 - Math.min(0.25, Math.abs(viewer.age - candidate.age) / 60);
  if (viewer.intention === candidate.intention) p += 0.05;
  if (viewer.city !== candidate.city && candidate.openToRelocate) p += 0.03;
  if (now.getTime() - candidateCreatedAt.getTime() < 7 * DAY_MS) p += 0.05;
  return Math.max(0, Math.min(1, p));
}

function lockedDimension(compat: CompatibilityResult | undefined, answered: Set<string>): { dimension: Dimension; questionsNeeded: number } | null {
  if (!compat) return null;
  const order: Dimension[] = ['religion', 'children', 'family', 'finance', 'lifestyle', 'career'];
  let best: { dimension: Dimension; questionsNeeded: number } | null = null;
  for (const d of order) {
    const score = compat.dims[d];
    if (score && !score.revealed) return { dimension: d, questionsNeeded: score.toReveal };
  }
  for (const d of order) {
    const missing = CORE_TOPIC_KEYS.filter((k) => !answered.has(k)).length;
    if (missing > 0) {
      best = { dimension: d, questionsNeeded: Math.min(2, missing) };
      break;
    }
  }
  return best;
}

/** Top Picks refresh at the next local-ish midnight (UTC day boundary). */
function nextRefresh(now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return d.toISOString();
}
