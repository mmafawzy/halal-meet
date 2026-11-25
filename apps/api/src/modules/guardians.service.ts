import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, count, desc, eq, inArray } from 'drizzle-orm';
import { computeCompatibility } from '@halal-meet/core';
import type {
  Gender,
  Guardian,
  GuardianApprovalBody,
  GuardianDashboard,
  GuardianInviteBody,
  GuardianInvitePreview,
  GuardianInviteResponse,
  GuardianLink,
  GuardianOpinion,
  GuardianOpinionBody,
  GuardianOpinionValue,
  GuardianPermissions,
  GuardianRelationship,
  GuardianStatus,
  GuardianUpdateBody,
  HalalMode,
  JourneyStage,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { uuidv7 } from '../common/ids';
import { InteractionsService } from './interactions.service';
import { MembersService } from './members';

/** Invited + active + paused guardians a member may have at once. */
export const MAX_GUARDIANS = 5;

type Row = typeof t.guardianships.$inferSelect;

const hashCode = (code: string) => createHash('sha256').update(code).digest('hex');
const newCode = () => randomBytes(16).toString('base64url');

/**
 * Guardian invitations, permissions and the guardian's read-only dashboard (spec 01 §43–46).
 * The member owns everything: every guardian-side read goes through the member's permission set, and a
 * paused guardian sees nothing.
 */
@Injectable()
export class GuardiansService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(InteractionsService) private readonly interactions: InteractionsService,
  ) {}

  // ───────── Member side ─────────

  async list(memberId: string): Promise<Guardian[]> {
    const rows = await this.db.select().from(t.guardianships).where(eq(t.guardianships.memberId, memberId)).orderBy(t.guardianships.invitedAt);
    return rows.map(toGuardian);
  }

  async invite(memberId: string, body: GuardianInviteBody): Promise<GuardianInviteResponse> {
    const [{ n } = { n: 0 }] = await this.db.select({ n: count() }).from(t.guardianships).where(eq(t.guardianships.memberId, memberId));
    if (n >= MAX_GUARDIANS) throw new ConflictException({ error: 'guardian_limit', max: MAX_GUARDIANS });
    const code = newCode();
    const [row] = await this.db
      .insert(t.guardianships)
      .values({
        id: uuidv7(),
        memberId,
        guardianId: null,
        name: body.name.trim(),
        relationship: body.relationship,
        status: 'invited',
        permissions: body.permissions,
        inviteTokenHash: hashCode(code),
      })
      .returning();
    return { guardian: toGuardian(row!), inviteCode: code };
  }

  async update(memberId: string, id: string, body: GuardianUpdateBody): Promise<Guardian> {
    const row = await this.own(memberId, id);
    const patch: Partial<Row> = {};
    if (body.permissions) patch.permissions = body.permissions;
    if (body.paused === true) patch.status = 'paused';
    if (body.paused === false) patch.status = row.guardianId ? 'active' : 'invited';
    const [updated] = await this.db.update(t.guardianships).set(patch).where(eq(t.guardianships.id, id)).returning();
    return toGuardian(updated!);
  }

  /** Issues a fresh code for an invitation nobody accepted yet (the old code stops working). */
  async reissue(memberId: string, id: string): Promise<GuardianInviteResponse> {
    const row = await this.own(memberId, id);
    if (row.guardianId) throw new ConflictException({ error: 'already_accepted' });
    const code = newCode();
    const [updated] = await this.db
      .update(t.guardianships)
      .set({ inviteTokenHash: hashCode(code), invitedAt: new Date() })
      .where(eq(t.guardianships.id, id))
      .returning();
    return { guardian: toGuardian(updated!), inviteCode: code };
  }

  /** Removing deletes the link (and the guardian's opinions); the guardian loses access immediately. */
  async remove(memberId: string, id: string): Promise<void> {
    await this.own(memberId, id);
    await this.db.delete(t.guardianships).where(eq(t.guardianships.id, id));
  }

  async opinionsForMember(memberId: string): Promise<GuardianOpinion[]> {
    const rows = await this.db
      .select({ o: t.guardianOpinions, g: t.guardianships })
      .from(t.guardianOpinions)
      .innerJoin(t.guardianships, eq(t.guardianOpinions.guardianshipId, t.guardianships.id))
      .where(eq(t.guardianships.memberId, memberId));
    return rows
      .map(({ o, g }) => ({
        guardianId: g.id,
        guardianName: g.name,
        relationship: g.relationship as GuardianRelationship,
        subjectId: o.subjectId,
        opinion: o.opinion as GuardianOpinionValue,
        note: o.note,
        updatedAt: o.updatedAt.toISOString(),
      }))
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  // ───────── Invitations ─────────

  async preview(code: string): Promise<GuardianInvitePreview> {
    const row = await this.byCode(code);
    const member = await this.members.get(row.memberId);
    return {
      memberFirstName: member?.row.firstName ?? '',
      memberGender: (member?.row.gender as Gender | undefined) ?? null,
      relationship: row.relationship as GuardianRelationship,
      permissions: row.permissions as GuardianPermissions,
    };
  }

  async accept(accountId: string, code: string): Promise<GuardianLink> {
    const row = await this.byCode(code);
    if (row.memberId === accountId) throw new BadRequestException({ error: 'cannot_guard_self' });
    const existing = await this.db
      .select({ id: t.guardianships.id })
      .from(t.guardianships)
      .where(and(eq(t.guardianships.memberId, row.memberId), eq(t.guardianships.guardianId, accountId)));
    if (existing.length) throw new ConflictException({ error: 'already_guardian' });
    // Conditional update so two people racing on one code cannot both win.
    const [updated] = await this.db
      .update(t.guardianships)
      .set({
        guardianId: accountId,
        inviteTokenHash: null,
        acceptedAt: new Date(),
        status: row.status === 'paused' ? 'paused' : 'active',
      })
      .where(and(eq(t.guardianships.id, row.id), eq(t.guardianships.inviteTokenHash, hashCode(code))))
      .returning();
    if (!updated) throw new ConflictException({ error: 'already_accepted' });
    const [link] = await this.linksFor(accountId, [updated]);
    return link!;
  }

  // ───────── Guardian side ─────────

  async links(guardianAccountId: string): Promise<GuardianLink[]> {
    const rows = await this.db.select().from(t.guardianships).where(eq(t.guardianships.guardianId, guardianAccountId));
    return this.linksFor(guardianAccountId, rows);
  }

  async dashboard(guardianAccountId: string, memberId: string, now = new Date()): Promise<GuardianDashboard> {
    const row = await this.asGuardian(guardianAccountId, memberId);
    if (row.status === 'paused') throw new ForbiddenException({ error: 'guardian_paused' });
    const perms = row.permissions as GuardianPermissions;
    const member = await this.members.get(memberId, now);

    let introductions: GuardianDashboard['introductions'] = null;
    let pendingApprovals: GuardianDashboard['pendingApprovals'] = null;
    let sharedProfiles: GuardianDashboard['sharedProfiles'] = null;
    const opinions = await this.db.select().from(t.guardianOpinions).where(eq(t.guardianOpinions.guardianshipId, row.id));
    const opinionOf = (subjectId: string) => {
      const o = opinions.find((x) => x.subjectId === subjectId);
      return o ? { value: o.opinion as GuardianOpinionValue, note: o.note } : null;
    };

    if (perms.see_matches || perms.approve_stages) {
      const matches = member ? (await this.interactions.listMatches(memberId, now)).filter((m) => m.status === 'active') : [];
      if (perms.see_matches) {
        introductions = matches.map((m) => ({
          matchId: m.matchId,
          otherId: m.other.id,
          otherFirstName: m.other.firstName,
          otherAge: m.other.age,
          otherCity: m.other.city,
          otherCountry: m.other.country,
          verifications: m.other.verifications,
          stage: m.stage,
          compatPct: perms.see_reports ? m.other.compatibility.displayPct : null,
          opinion: opinionOf(m.other.id),
        }));
      }
      if (perms.approve_stages) {
        const waiting = matches.filter((m) => m.stage === 4 || m.stage === 5);
        const ids = waiting.map((m) => m.matchId);
        const decisions = ids.length
          ? await this.db.select().from(t.stageApprovals).where(and(inArray(t.stageApprovals.matchId, ids), eq(t.stageApprovals.guardianshipId, row.id)))
          : [];
        const ready = ids.length
          ? await this.db.select().from(t.stageReadiness).where(and(inArray(t.stageReadiness.matchId, ids), eq(t.stageReadiness.accountId, memberId)))
          : [];
        pendingApprovals = [];
        for (const m of waiting) {
          const nextStage = (m.stage + 1) as JourneyStage;
          const d = decisions.find((x) => x.matchId === m.matchId && x.stage === nextStage);
          if (d?.decision === 'approve') continue;
          pendingApprovals.push({
            matchId: m.matchId,
            otherFirstName: m.other.firstName,
            nextStage,
            memberReady: ready.some((r) => r.matchId === m.matchId && r.stage === nextStage),
            decision: d?.decision === 'discuss' ? 'discuss' : null,
          });
        }
      }
    }

    if (perms.see_matches) {
      const shares = await this.db.select().from(t.guardianShares).where(eq(t.guardianShares.memberId, memberId)).orderBy(desc(t.guardianShares.sharedAt));
      const subjects = await this.members.getMany(shares.map((x) => x.subjectId), now);
      sharedProfiles = [];
      for (const x of shares) {
        const subject = subjects.get(x.subjectId);
        if (!subject) continue;
        sharedProfiles.push({
          subjectId: subject.id,
          firstName: subject.row.firstName,
          age: subject.match.age,
          city: subject.row.city,
          country: subject.row.country,
          verifications: subject.verifications,
          compatPct: perms.see_reports && member ? computeCompatibility(member.match, subject.match).displayPct : null,
          sharedAt: x.sharedAt.toISOString(),
          opinion: opinionOf(subject.id),
        });
      }
    }

    let safety: GuardianDashboard['safety'] = null;
    if (perms.safety_alerts) {
      const [{ n } = { n: 0 }] = await this.db
        .select({ n: count() })
        .from(t.reports)
        .where(and(eq(t.reports.reporterId, memberId), eq(t.reports.status, 'open')));
      safety = { allClear: n === 0, openReports: n };
    }

    return {
      member: { id: memberId, firstName: member?.row.firstName ?? '', halalMode: (member?.row.halalMode as HalalMode) ?? 'guided' },
      relationship: row.relationship as GuardianRelationship,
      permissions: perms,
      introductions,
      pendingApprovals,
      sharedProfiles,
      safety,
    };
  }

  async putOpinion(guardianAccountId: string, memberId: string, subjectId: string, body: GuardianOpinionBody): Promise<void> {
    const row = await this.asGuardian(guardianAccountId, memberId);
    if (row.status === 'paused') throw new ForbiddenException({ error: 'guardian_paused' });
    if (!(row.permissions as GuardianPermissions).see_matches) throw new ForbiddenException({ error: 'permission_denied' });
    // Opinions are only about people the member is matched with, or chose to share.
    const [shared] = await this.db
      .select()
      .from(t.guardianShares)
      .where(and(eq(t.guardianShares.memberId, memberId), eq(t.guardianShares.subjectId, subjectId)));
    if (!shared) {
      const matches = await this.interactions.listMatches(memberId);
      if (!matches.some((m) => m.other.id === subjectId)) throw new NotFoundException({ error: 'not_an_introduction' });
    }
    const note = body.note?.trim() || null;
    await this.db
      .insert(t.guardianOpinions)
      .values({ guardianshipId: row.id, subjectId, opinion: body.opinion, note, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [t.guardianOpinions.guardianshipId, t.guardianOpinions.subjectId],
        set: { opinion: body.opinion, note, updatedAt: new Date() },
      });
  }

  /** Approve (or ask to discuss first) a match moving to stage 5 or 6. Approving re-evaluates the stage at once. */
  async decideStage(guardianAccountId: string, memberId: string, matchId: string, body: GuardianApprovalBody): Promise<void> {
    const row = await this.asGuardian(guardianAccountId, memberId);
    if (row.status === 'paused') throw new ForbiddenException({ error: 'guardian_paused' });
    if (!(row.permissions as GuardianPermissions).approve_stages) throw new ForbiddenException({ error: 'permission_denied' });
    const match = (await this.interactions.listMatches(memberId)).find((m) => m.matchId === matchId && m.status === 'active');
    if (!match) throw new NotFoundException({ error: 'match_not_found' });
    if (match.stage !== body.stage - 1) throw new ConflictException({ error: 'wrong_stage', stage: match.stage });
    await this.db
      .insert(t.stageApprovals)
      .values({ matchId, guardianshipId: row.id, stage: body.stage, decision: body.decision, decidedAt: new Date() })
      .onConflictDoUpdate({
        target: [t.stageApprovals.matchId, t.stageApprovals.guardianshipId, t.stageApprovals.stage],
        set: { decision: body.decision, decidedAt: new Date() },
      });
    if (body.decision === 'approve') await this.interactions.recomputeStage(matchId);
  }

  // ───────── Shares ─────────

  async share(memberId: string, subjectId: string): Promise<void> {
    if (subjectId === memberId) throw new BadRequestException({ error: 'cannot_share_self' });
    const subject = await this.members.get(subjectId);
    if (!subject) throw new NotFoundException({ error: 'profile_not_found' });
    await this.db.insert(t.guardianShares).values({ memberId, subjectId, sharedAt: new Date() }).onConflictDoNothing();
  }

  async unshare(memberId: string, subjectId: string): Promise<void> {
    await this.db.delete(t.guardianShares).where(and(eq(t.guardianShares.memberId, memberId), eq(t.guardianShares.subjectId, subjectId)));
  }

  /** The guardian steps away themselves. */
  async leave(guardianAccountId: string, memberId: string): Promise<void> {
    const row = await this.asGuardian(guardianAccountId, memberId);
    await this.db.delete(t.guardianships).where(eq(t.guardianships.id, row.id));
  }

  // ───────── helpers ─────────

  private async own(memberId: string, id: string): Promise<Row> {
    const [row] = await this.db.select().from(t.guardianships).where(and(eq(t.guardianships.id, id), eq(t.guardianships.memberId, memberId)));
    if (!row) throw new NotFoundException({ error: 'guardian_not_found' });
    return row;
  }

  private async byCode(code: string): Promise<Row> {
    if (!code || code.length > 64) throw new NotFoundException({ error: 'invite_not_found' });
    const [row] = await this.db.select().from(t.guardianships).where(eq(t.guardianships.inviteTokenHash, hashCode(code)));
    if (!row) throw new NotFoundException({ error: 'invite_not_found' });
    return row;
  }

  private async asGuardian(guardianAccountId: string, memberId: string): Promise<Row> {
    const [row] = await this.db
      .select()
      .from(t.guardianships)
      .where(and(eq(t.guardianships.memberId, memberId), eq(t.guardianships.guardianId, guardianAccountId)));
    if (!row) throw new NotFoundException({ error: 'guardianship_not_found' });
    return row;
  }

  private async linksFor(_guardianAccountId: string, rows: Row[]): Promise<GuardianLink[]> {
    if (rows.length === 0) return [];
    const names = await this.db
      .select({ id: t.profiles.accountId, firstName: t.profiles.firstName })
      .from(t.profiles)
      .where(inArray(t.profiles.accountId, rows.map((r) => r.memberId)));
    const nameOf = new Map(names.map((n) => [n.id, n.firstName]));
    return rows.map((r) => ({
      guardianshipId: r.id,
      memberId: r.memberId,
      memberFirstName: nameOf.get(r.memberId) ?? '',
      relationship: r.relationship as GuardianRelationship,
      status: r.status as GuardianStatus,
      permissions: r.permissions as GuardianPermissions,
    }));
  }
}

function toGuardian(r: Row): Guardian {
  return {
    id: r.id,
    name: r.name,
    relationship: r.relationship as GuardianRelationship,
    permissions: r.permissions as GuardianPermissions,
    status: r.status as GuardianStatus,
    accepted: !!r.guardianId,
    invitedAt: r.invitedAt.toISOString(),
    acceptedAt: r.acceptedAt ? r.acceptedAt.toISOString() : null,
  };
}
