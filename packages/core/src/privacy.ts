/**
 * Privacy centre (spec 05 privacy/legal, spec 01 screen 58): pause, incognito, consents, data export and
 * account deletion, plus account-visibility rules shared by the server and the mock backend.
 *
 * Visibility rules (enforced on every discovery surface: feed, Top Picks, incoming interests, profile
 * lookups, Passport counts):
 * - paused accounts are hidden until they resume (timed pauses resume on their own); existing matches keep working;
 * - incognito accounts are shown only to people they sent an interest to, and to existing matches;
 * - accounts with a deletion request, suspended accounts (until the suspension ends) and banned accounts are
 *   hidden everywhere.
 * Incognito is a plan entitlement: `PLAN_LIMITS[tier].incognito` (Plus and above).
 */
import type { MatchPreferencesInput } from './api';

// ───────── Consents ─────────

export type ConsentKind = 'terms' | 'privacy' | 'religious_data' | 'marketing' | 'guardian_access' | 'ai_processing';

export const CONSENT_KINDS: readonly ConsentKind[] = ['terms', 'privacy', 'religious_data', 'marketing', 'guardian_access', 'ai_processing'];

/** Needed to use the service; they can't be withdrawn (delete the account instead). */
export const REQUIRED_CONSENTS: readonly ConsentKind[] = ['terms', 'privacy'];

/** Current version of the consent texts. Bump when the wording changes. */
export const CONSENT_VERSION = '1';

export interface Consent {
  kind: ConsentKind;
  granted: boolean;
  version: string;
  decidedAt: string;
}

/** PUT /me/consents/:kind */
export interface ConsentBody {
  granted: boolean;
  version?: string;
}

// ───────── Account state ─────────

/** Days between a deletion request and the permanent erasure (the server may override it with config). */
export const DELETION_GRACE_DAYS = 30;

/** Longest pause with an end date (open-ended pauses use `until: null`). */
export const MAX_PAUSE_DAYS = 365;

export type AccountVisibilityState = 'active' | 'paused' | 'suspended' | 'banned' | 'deletion_pending';

/** GET /me/privacy — the member's own account state (also readable while suspended). */
export interface PrivacyStatus {
  state: AccountVisibilityState;
  paused: boolean;
  /** End of a timed pause. `null` while paused means "until I resume". */
  pausedUntil: string | null;
  incognito: boolean;
  /** From the plan (Plus and above). */
  canIncognito: boolean;
  deletionRequestedAt: string | null;
  /** When the account will be erased unless the request is cancelled. */
  deletionScheduledFor: string | null;
  graceDays: number;
  suspendedUntil: string | null;
}

/** PUT /me/pause */
export interface PauseBody {
  /** ISO end of the pause, or null for "until I resume". */
  until: string | null;
}

/** PUT /me/incognito */
export interface IncognitoBody {
  on: boolean;
}

/** 403 bodies from the auth guard. */
export type AccountRestrictionError =
  | { error: 'account_suspended'; until: string | null }
  | { error: 'account_banned' }
  | { error: 'deletion_pending'; scheduledFor: string | null };

// ───────── Loose-end reads ─────────

/** GET /me/preferences — what is saved, or the defaults the server applies (`saved: false`). */
export interface MyPreferencesResponse {
  preferences: MatchPreferencesInput;
  saved: boolean;
}

/** GET /blocks */
export interface BlockedMember {
  subjectId: string;
  /** Null once the other account no longer exists. */
  firstName: string | null;
  blockedAt: string;
}

/** GET /guardians/shares — profiles the member shared with their guardians. */
export interface GuardianShareSummary {
  subjectId: string;
  firstName: string | null;
  sharedAt: string;
}

// ───────── Data export ─────────

/**
 * GET /me/export — everything the account owns, as JSON (served as an attachment). Other members appear only
 * through what the member already saw: first name and ids, never their private data.
 */
export interface DataExport {
  format: 'halal-meet-export';
  version: 1;
  exportedAt: string;
  account: {
    id: string;
    phone: string;
    locale: string;
    status: string;
    createdAt: string;
    lastActiveAt: string | null;
    pausedUntil: string | null;
    incognito: boolean;
    deletionRequestedAt: string | null;
  };
  profile: Record<string, unknown> | null;
  answers: Array<Record<string, unknown>>;
  preferences: Record<string, unknown> | null;
  verifications: Array<Record<string, unknown>>;
  photos: Array<Record<string, unknown>>;
  interestsSent: Array<{ toId: string; toFirstName: string | null; level: string; note: string | null; status: string; createdAt: string }>;
  passes: Array<{ toId: string; reason: string | null; createdAt: string }>;
  matches: Array<{
    matchId: string;
    otherId: string;
    otherFirstName: string | null;
    stage: number;
    status: string;
    createdAt: string;
    /** Only the messages this member wrote (and their topic-card answers). */
    myMessages: Array<{ id: string; kind: string; body: string; topicKey: string | null; sentAt: string }>;
    myTopicAnswers: Array<{ messageId: string; value: string; answeredAt: string }>;
  }>;
  guardians: Array<Record<string, unknown>>;
  guardianOpinionsReceived: Array<Record<string, unknown>>;
  guardianOf: Array<Record<string, unknown>>;
  sharedWithGuardians: Array<{ subjectId: string; sharedAt: string }>;
  reportsFiled: Array<{ id: string; subjectId: string; category: string; details: string | null; status: string; createdAt: string }>;
  blocks: Array<{ subjectId: string; createdAt: string }>;
  consents: Consent[];
  devices: Array<Record<string, unknown>>;
  notificationPrefs: Record<string, unknown> | null;
  notifications: Array<Record<string, unknown>>;
  passport: Array<Record<string, unknown>>;
  subscriptions: Array<Record<string, unknown>>;
  purchases: Array<Record<string, unknown>>;
}

export const PRIVACY_ROUTES = {
  privacyStatus: 'GET /me/privacy',
  privacyPause: 'PUT /me/pause',
  privacyResume: 'DELETE /me/pause',
  privacyIncognito: 'PUT /me/incognito',
  privacyExport: 'GET /me/export',
  privacyRequestDeletion: 'POST /me/deletion',
  privacyCancelDeletion: 'DELETE /me/deletion',
  privacyConsents: 'GET /me/consents',
  privacyPutConsent: 'PUT /me/consents/:kind',
  privacyPreferences: 'GET /me/preferences',
  privacyBlocks: 'GET /blocks',
  privacyUnblock: 'DELETE /blocks/:subjectId',
  privacyGuardianShares: 'GET /guardians/shares',
} as const;

/** Routes a suspended, banned or deletion-pending account may still call (plus /auth/*). */
export const RESTRICTED_ACCOUNT_ALLOWED: readonly string[] = [
  'GET /me',
  PRIVACY_ROUTES.privacyStatus,
  PRIVACY_ROUTES.privacyExport,
  PRIVACY_ROUTES.privacyRequestDeletion,
  PRIVACY_ROUTES.privacyCancelDeletion,
];

/** True while a pause is in effect (`until` null = open-ended). */
export function isPauseActive(paused: boolean, until: string | null, now = new Date()): boolean {
  if (!paused) return false;
  return until === null || new Date(until).getTime() > now.getTime();
}

/** When an account with a deletion request will be erased. */
export function deletionDate(requestedAt: string | Date, graceDays = DELETION_GRACE_DAYS): Date {
  return new Date(new Date(requestedAt).getTime() + graceDays * 86_400_000);
}
