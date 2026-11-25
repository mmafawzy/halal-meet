/**
 * Guardians (spec 01 §43–46, README §2 and §5).
 * A member invites a guardian and decides exactly what that guardian can see. The member owns the
 * account: guardians never control it, never browse other members and never appear in matching.
 * Their presence is always visible to the other person in a conversation.
 */
import type { JourneyStage } from './api';
import type { Gender, HalalMode, VerificationKind } from './types';

export type GuardianRelationship = 'father' | 'mother' | 'brother' | 'sister' | 'uncle' | 'aunt' | 'other';

export const GUARDIAN_RELATIONSHIPS: GuardianRelationship[] = ['father', 'mother', 'brother', 'sister', 'uncle', 'aunt', 'other'];

export type GuardianPermission =
  | 'see_matches'
  | 'see_reports'
  | 'read_conversations'
  | 'participate'
  | 'join_calls'
  | 'approve_stages'
  | 'contact_family'
  | 'safety_alerts';

export const GUARDIAN_PERMISSIONS: GuardianPermission[] = [
  'see_matches',
  'see_reports',
  'read_conversations',
  'participate',
  'join_calls',
  'approve_stages',
  'contact_family',
  'safety_alerts',
];

export type GuardianPermissions = Record<GuardianPermission, boolean>;

/** Defaults per Halal Mode (spec 01 §44): Mode 3 (wali) turns everything on; other modes share only the basics. */
export function defaultGuardianPermissions(mode: HalalMode): GuardianPermissions {
  const wali = mode === 'wali';
  return {
    see_matches: true,
    see_reports: true,
    read_conversations: wali,
    participate: wali,
    join_calls: wali,
    approve_stages: wali,
    contact_family: wali,
    safety_alerts: true,
  };
}

/** `invited` until the guardian accepts; `paused` keeps permissions but shares nothing new. */
export type GuardianStatus = 'invited' | 'active' | 'paused';

export type GuardianOpinionValue = 'support' | 'discuss' | 'concern';

// ───────── Member side ─────────

/** A guardian as the member sees it. */
export interface Guardian {
  id: string;
  /** The name the member typed when inviting. */
  name: string;
  relationship: GuardianRelationship;
  permissions: GuardianPermissions;
  status: GuardianStatus;
  /** True once someone accepted the invitation (so resuming a paused guardian returns to `active`, not `invited`). */
  accepted: boolean;
  invitedAt: string;
  acceptedAt: string | null;
}

export interface GuardianInviteBody {
  name: string;
  relationship: GuardianRelationship;
  permissions: GuardianPermissions;
}

/**
 * Returned when an invitation is created or re-issued. `inviteCode` is shown once: the server only keeps
 * its hash, so re-sending an invitation issues a new code and invalidates the old one.
 */
export interface GuardianInviteResponse {
  guardian: Guardian;
  inviteCode: string;
}

/** PATCH /guardians/:id — change permissions and/or pause/resume. */
export interface GuardianUpdateBody {
  permissions?: GuardianPermissions;
  paused?: boolean;
}

/** An opinion a guardian left on someone the member was introduced to (only the member sees it). */
export interface GuardianOpinion {
  guardianId: string;
  guardianName: string;
  relationship: GuardianRelationship;
  subjectId: string;
  opinion: GuardianOpinionValue;
  note: string | null;
  updatedAt: string;
}

// ───────── Guardian side ─────────

/** Public preview of an invitation (no sign-in needed): first name only, plus what will be shared. */
export interface GuardianInvitePreview {
  memberFirstName: string;
  /** Lets Arabic copy about the member use the right grammatical gender. */
  memberGender: Gender | null;
  relationship: GuardianRelationship;
  permissions: GuardianPermissions;
}

/** One member this account is a guardian for. */
export interface GuardianLink {
  guardianshipId: string;
  memberId: string;
  memberFirstName: string;
  relationship: GuardianRelationship;
  status: GuardianStatus;
  permissions: GuardianPermissions;
}

export interface GuardianIntroduction {
  matchId: string;
  otherId: string;
  otherFirstName: string;
  otherAge: number;
  otherCity: string;
  otherCountry: string;
  verifications: VerificationKind[];
  stage: JourneyStage;
  /** Null unless the guardian may see compatibility reports. */
  compatPct: number | null;
  /** This guardian's own opinion, if any. */
  opinion: { value: GuardianOpinionValue; note: string | null } | null;
}

export interface GuardianDashboard {
  member: { id: string; firstName: string; halalMode: HalalMode };
  relationship: GuardianRelationship;
  permissions: GuardianPermissions;
  /** Null when the guardian may not see introductions and matches. */
  introductions: GuardianIntroduction[] | null;
  /**
   * Active matches at stage 4 (next: 5, family introduction) or 5 (next: 6, meeting) that this guardian has not
   * approved yet (only with `approve_stages`). `memberReady` is true once the member tapped "ready" for that stage.
   */
  pendingApprovals: GuardianPendingApproval[] | null;
  /** Profiles the member chose to share for an opinion (only with `see_matches`). */
  sharedProfiles: GuardianSharedProfile[] | null;
  /** Only with `safety_alerts`. Counts only, never details. */
  safety: { allClear: boolean; openReports: number } | null;
}

export interface GuardianPendingApproval {
  matchId: string;
  otherFirstName: string;
  nextStage: JourneyStage;
  memberReady: boolean;
  /** 'discuss' when this guardian asked to talk first; null when undecided. */
  decision: 'discuss' | null;
}

export interface GuardianSharedProfile {
  subjectId: string;
  firstName: string;
  age: number;
  city: string;
  country: string;
  verifications: VerificationKind[];
  /** Null unless the guardian may see compatibility reports. */
  compatPct: number | null;
  sharedAt: string;
  opinion: { value: GuardianOpinionValue; note: string | null } | null;
}

/** PUT /guardian/members/:memberId/approvals/:matchId */
export interface GuardianApprovalBody {
  stage: 5 | 6;
  decision: 'approve' | 'discuss';
}

/** POST /guardians/shares */
export interface GuardianShareBody {
  subjectId: string;
}

/**
 * A guardian as shown to the people in a conversation: relationship and role only, never a name or contact.
 * Spec 01 §44: presence is always visible to the other party.
 */
export interface GuardianPresence {
  relationship: GuardianRelationship;
  readsConversation: boolean;
  participates: boolean;
}

/** Guardian approvals still needed before a match can move to `stage`. */
export interface PendingGuardianApproval {
  stage: 5 | 6;
  /** Waiting on one of my guardians. */
  mine: boolean;
  /** Waiting on one of theirs. */
  theirs: boolean;
}

export interface GuardianOpinionBody {
  opinion: GuardianOpinionValue;
  note?: string | null;
}

export const GUARDIAN_ROUTES = {
  listGuardians: 'GET /guardians',
  inviteGuardian: 'POST /guardians',
  updateGuardian: 'PATCH /guardians/:id',
  reissueInvite: 'POST /guardians/:id/invite',
  removeGuardian: 'DELETE /guardians/:id',
  guardianOpinions: 'GET /guardians/opinions',
  invitePreview: 'GET /guardian-invites/:code (public)',
  acceptInvite: 'POST /guardian-invites/:code/accept',
  guardianLinks: 'GET /guardian/members',
  guardianDashboard: 'GET /guardian/members/:memberId',
  guardianOpinion: 'PUT /guardian/members/:memberId/opinions/:subjectId',
  leaveGuardianship: 'DELETE /guardian/members/:memberId',
  guardianApproval: 'PUT /guardian/members/:memberId/approvals/:matchId',
  shareWithGuardians: 'POST /guardians/shares',
  unshareWithGuardians: 'DELETE /guardians/shares/:subjectId',
} as const;
