/**
 * Guardian facts the journey logic needs (presence in a conversation, stage approvals), read straight from the
 * tables so InteractionsService does not depend on GuardiansService (which depends on it).
 */
import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import type { GuardianPermissions, GuardianPresence, GuardianRelationship, PendingGuardianApproval } from '@halal-meet/core';
import type { Db } from '../db/client';
import * as t from '../db/schema';

export interface ActiveGuardian {
  id: string;
  memberId: string;
  relationship: GuardianRelationship;
  permissions: GuardianPermissions;
}

/** Accepted, not paused guardians of the given members. */
export async function activeGuardiansOf(db: Db, memberIds: string[]): Promise<Map<string, ActiveGuardian[]>> {
  const out = new Map<string, ActiveGuardian[]>();
  if (memberIds.length === 0) return out;
  const rows = await db
    .select()
    .from(t.guardianships)
    .where(and(inArray(t.guardianships.memberId, memberIds), eq(t.guardianships.status, 'active'), isNotNull(t.guardianships.guardianId)));
  for (const r of rows) {
    const list = out.get(r.memberId) ?? [];
    list.push({ id: r.id, memberId: r.memberId, relationship: r.relationship as GuardianRelationship, permissions: r.permissions as GuardianPermissions });
    out.set(r.memberId, list);
  }
  return out;
}

export function toPresence(guardians: ActiveGuardian[] | undefined): GuardianPresence[] {
  return (guardians ?? []).map((g) => ({
    relationship: g.relationship,
    readsConversation: !!g.permissions.read_conversations,
    participates: !!g.permissions.participate,
  }));
}

export interface ApprovalState {
  /** True when every person who has an approving guardian got an 'approve' from one of them for `stage`. */
  approved: (stage: 5 | 6) => boolean;
  /** Which sides are still waiting for `stage`. */
  waiting: (stage: 5 | 6) => { a: boolean; b: boolean };
}

export async function approvalState(db: Db, match: { id: string; aId: string; bId: string }): Promise<ApprovalState> {
  const guardians = await activeGuardiansOf(db, [match.aId, match.bId]);
  const approvers = (memberId: string) => (guardians.get(memberId) ?? []).filter((g) => g.permissions.approve_stages);
  const decisions = await db.select().from(t.stageApprovals).where(eq(t.stageApprovals.matchId, match.id));
  const sideWaiting = (memberId: string, stage: number) => {
    const ids = new Set(approvers(memberId).map((g) => g.id));
    if (ids.size === 0) return false;
    return !decisions.some((d) => d.stage === stage && d.decision === 'approve' && ids.has(d.guardianshipId));
  };
  const waiting = (stage: 5 | 6) => ({ a: sideWaiting(match.aId, stage), b: sideWaiting(match.bId, stage) });
  return {
    waiting,
    approved: (stage) => {
      const w = waiting(stage);
      return !w.a && !w.b;
    },
  };
}

export function pendingFor(viewerIsA: boolean, stage: 5 | 6, w: { a: boolean; b: boolean }): PendingGuardianApproval {
  return { stage, mine: viewerIsA ? w.a : w.b, theirs: viewerIsA ? w.b : w.a };
}
