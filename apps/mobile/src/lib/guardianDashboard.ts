/**
 * Builds a `GuardianDashboard` (GUARDIAN_ROUTES `GET /guardian/members/:memberId`) from a member's matches
 * and a guardian's permissions. Pure, so the mock backend and the member's own "what my guardian sees"
 * preview use exactly the same rules as the server:
 * - introductions: the member's ACTIVE matches, null without `see_matches`
 * - compatPct: null without `see_reports`
 * - pendingApprovals: active matches at stage 4 (next 5) or 5 (next 6) this guardian has not approved yet,
 *   null without `approve_stages` (`memberReady` once the member tapped ready, `decision: 'discuss'` if they asked to talk)
 * - sharedProfiles: profiles the member shared for an opinion, null without `see_matches`
 * - safety: open reports filed by the member (counts only), null without `safety_alerts`
 */
import type {
  GuardianDashboard,
  GuardianIntroduction,
  GuardianOpinionValue,
  GuardianPendingApproval,
  GuardianPermissions,
  GuardianRelationship,
  GuardianSharedProfile,
  HalalMode,
  JourneyStage,
  MatchSummary,
  VerificationKind,
} from '@halal-meet/core';

export interface DashboardMatchInput {
  matchId: string;
  otherId: string;
  otherFirstName: string;
  otherAge: number;
  otherCity: string;
  otherCountry: string;
  verifications: VerificationKind[];
  stage: JourneyStage;
  status: 'active' | 'closed';
  compatPct: number;
  /** True once the member tapped "ready" for the next stage (stage + 1). */
  memberReady?: boolean;
}

/** A profile the member shared with their guardians (POST /guardians/shares). */
export interface DashboardSharedInput {
  subjectId: string;
  firstName: string;
  age: number;
  city: string;
  country: string;
  verifications: VerificationKind[];
  compatPct: number;
  sharedAt: string;
}

/** This guardian's stage decisions, keyed by match id. */
export type DashboardApprovals = Record<string, { stage: 5 | 6; decision: 'approve' | 'discuss' }>;

export interface DashboardInput {
  member: { id: string; firstName: string; halalMode: HalalMode };
  relationship: GuardianRelationship;
  permissions: GuardianPermissions;
  matches: DashboardMatchInput[];
  /** This guardian's own opinions, keyed by subject (the other person's profile id). */
  opinions?: Record<string, { value: GuardianOpinionValue; note: string | null }>;
  /** This guardian's own approve / discuss decisions. */
  approvals?: DashboardApprovals;
  shared?: DashboardSharedInput[];
  openReports?: number;
}

export function buildGuardianDashboard({
  member,
  relationship,
  permissions,
  matches,
  opinions = {},
  approvals = {},
  shared = [],
  openReports = 0,
}: DashboardInput): GuardianDashboard {
  const active = matches.filter((m) => m.status === 'active');
  const introductions: GuardianIntroduction[] | null = permissions.see_matches
    ? active.map((m) => ({
        matchId: m.matchId,
        otherId: m.otherId,
        otherFirstName: m.otherFirstName,
        otherAge: m.otherAge,
        otherCity: m.otherCity,
        otherCountry: m.otherCountry,
        verifications: m.verifications,
        stage: m.stage,
        compatPct: permissions.see_reports ? m.compatPct : null,
        opinion: opinions[m.otherId] ?? null,
      }))
    : null;
  return {
    member,
    relationship,
    permissions,
    introductions,
    pendingApprovals: permissions.approve_stages
      ? active
          .filter((m) => m.stage === 4 || m.stage === 5)
          .map((m): GuardianPendingApproval | null => {
            const nextStage = (m.stage + 1) as 5 | 6;
            const mine = approvals[m.matchId];
            const decided = mine && mine.stage === nextStage ? mine.decision : null;
            if (decided === 'approve') return null;
            return { matchId: m.matchId, otherFirstName: m.otherFirstName, nextStage, memberReady: !!m.memberReady, decision: decided };
          })
          .filter((a): a is GuardianPendingApproval => a !== null)
      : null,
    sharedProfiles: permissions.see_matches
      ? [...shared]
          .sort((a, b) => b.sharedAt.localeCompare(a.sharedAt))
          .map(
            (p): GuardianSharedProfile => ({
              subjectId: p.subjectId,
              firstName: p.firstName,
              age: p.age,
              city: p.city,
              country: p.country,
              verifications: p.verifications,
              compatPct: permissions.see_reports ? p.compatPct : null,
              sharedAt: p.sharedAt,
              opinion: opinions[p.subjectId] ?? null,
            }),
          )
      : null,
    safety: permissions.safety_alerts ? { allClear: openReports === 0, openReports } : null,
  };
}

/** Adapts a member-side `MatchSummary` (GET /matches) to the builder input. */
export function dashboardInputFromSummary(m: MatchSummary): DashboardMatchInput {
  return {
    matchId: m.matchId,
    otherId: m.other.id,
    otherFirstName: m.other.firstName,
    otherAge: m.other.age,
    otherCity: m.other.city,
    otherCountry: m.other.country,
    verifications: m.other.verifications,
    stage: m.stage,
    status: m.status,
    compatPct: m.other.compatibility.displayPct,
    memberReady: m.pendingGuardianApproval?.stage === m.stage + 1,
  };
}
