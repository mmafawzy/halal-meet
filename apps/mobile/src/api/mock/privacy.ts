/**
 * In-memory privacy centre for the mock backend (same rules and errors as apps/api PrivacyService).
 * The demo has a single real account, so pause / incognito / deletion only change what the Privacy screen
 * shows; the seeded members never "look" for you. State lives on the mock db under `privacy`, so it is
 * snapshotted with the rest of the demo and cleared by Demo tools → Reset.
 */
import {
  CONSENT_KINDS,
  CONSENT_VERSION,
  DELETION_GRACE_DAYS,
  MAX_PAUSE_DAYS,
  PLAN_LIMITS,
  REQUIRED_CONSENTS,
  type Answer,
  type Consent,
  type ConsentKind,
  type DataExport,
  type Guardian,
  type Locale,
  type MatchPreferencesInput,
  type Message,
  type PassportDestination,
  type PlanTier,
  type PrivacyStatus,
  type ProfileInput,
  type ReportBody,
  type VerificationKind,
} from '@halal-meet/core';

import type { PrivacyApi } from '../privacy';
import { ApiError } from '../types';
import type { SeedProfile } from './seed';

const DAY = 86_400_000;

export interface MockPrivacyState {
  paused: boolean;
  pausedUntil: string | null;
  incognito: boolean;
  deletionRequestedAt: string | null;
  consents: Consent[];
  /** When each block happened (the core mock only keeps ids). */
  blockedAt: Record<string, string>;
}

/** The parts of the mock db this module reads (structural subset of MockDb in ./index.ts). */
export interface PrivacyMockDb {
  accountId: string;
  phone: string | null;
  locale: Locale;
  profile: (ProfileInput & { id: string; photoUrl: string | null; verifications: VerificationKind[] }) | null;
  answers: Answer[];
  prefs: MatchPreferencesInput | null;
  tier: PlanTier;
  seeds: SeedProfile[];
  sent: Array<{ toId: string; level: 'interest' | 'serious'; at: string; note: string | null }>;
  passes: Record<string, string>;
  matches: Array<{ matchId: string; otherId: string; createdAt: string; stage: number; status: 'active' | 'closed' }>;
  messages: Record<string, Message[]>;
  blocked: string[];
  reports: ReportBody[];
  guardians: Guardian[];
  shares: Array<{ subjectId: string; sharedAt: string }>;
  destinations: PassportDestination[];
  feedOrder?: string[] | null;
  privacy?: MockPrivacyState;
}

export interface PrivacyMockContext {
  op<T>(fn: () => T): Promise<T>;
  db(): PrivacyMockDb;
  now(): Date;
  locale(): Locale;
  ensureSeeds(): void;
  /** The defaults the mock applies when no preferences were saved. */
  defaultPreferences(): MatchPreferencesInput;
}

export function freshPrivacyState(): MockPrivacyState {
  return { paused: false, pausedUntil: null, incognito: false, deletionRequestedAt: null, consents: [], blockedAt: {} };
}

export function createMockPrivacyApi(ctx: PrivacyMockContext): PrivacyApi {
  const state = (): MockPrivacyState => {
    const db = ctx.db();
    db.privacy ??= freshPrivacyState();
    return db.privacy;
  };
  const firstName = (id: string): string | null => {
    const seed = ctx.db().seeds.find((s) => s.id === id);
    if (!seed) return null;
    return ctx.locale() === 'ar' ? seed.name[1] : seed.name[0];
  };
  const canIncognito = () => PLAN_LIMITS[ctx.db().tier].incognito;

  function status(): PrivacyStatus {
    const s = state();
    // Auto-resume once a timed pause ends.
    if (s.paused && s.pausedUntil && new Date(s.pausedUntil) <= ctx.now()) {
      s.paused = false;
      s.pausedUntil = null;
    }
    const scheduled = s.deletionRequestedAt ? new Date(new Date(s.deletionRequestedAt).getTime() + DELETION_GRACE_DAYS * DAY).toISOString() : null;
    return {
      state: s.deletionRequestedAt ? 'deletion_pending' : s.paused ? 'paused' : 'active',
      paused: s.paused,
      pausedUntil: s.paused ? s.pausedUntil : null,
      incognito: s.incognito && canIncognito(),
      canIncognito: canIncognito(),
      deletionRequestedAt: s.deletionRequestedAt,
      deletionScheduledFor: scheduled,
      graceDays: DELETION_GRACE_DAYS,
      suspendedUntil: null,
    };
  }

  function restricted() {
    const s = state();
    if (s.deletionRequestedAt) {
      throw new ApiError(403, 'deletion_pending', { error: 'deletion_pending', scheduledFor: status().deletionScheduledFor });
    }
  }

  function exportData(): DataExport {
    const db = ctx.db();
    ctx.ensureSeeds();
    const s = state();
    const me = db.profile?.id ?? 'me';
    return {
      format: 'halal-meet-export',
      version: 1,
      exportedAt: ctx.now().toISOString(),
      account: {
        id: db.accountId,
        phone: db.phone ?? '',
        locale: db.locale,
        status: s.paused ? 'paused' : 'active',
        createdAt: ctx.now().toISOString(),
        lastActiveAt: ctx.now().toISOString(),
        pausedUntil: s.pausedUntil,
        incognito: s.incognito,
        deletionRequestedAt: s.deletionRequestedAt,
      },
      profile: db.profile ? { ...db.profile } : null,
      answers: db.answers.map((a) => ({ ...a })),
      preferences: db.prefs ? { ...db.prefs } : null,
      verifications: (db.profile?.verifications ?? []).map((kind) => ({ kind, status: 'approved' })),
      photos: [],
      interestsSent: db.sent.map((x) => ({ toId: x.toId, toFirstName: firstName(x.toId), level: x.level, note: x.note, status: 'pending', createdAt: x.at })),
      passes: Object.entries(db.passes).map(([toId, at]) => ({ toId, reason: null, createdAt: at })),
      matches: db.matches.map((m) => ({
        matchId: m.matchId,
        otherId: m.otherId,
        otherFirstName: firstName(m.otherId),
        stage: m.stage,
        status: m.status,
        createdAt: m.createdAt,
        myMessages: (db.messages[m.matchId] ?? [])
          .filter((msg) => msg.senderId === me)
          .map((msg) => ({ id: msg.id, kind: msg.kind, body: msg.body, topicKey: msg.topicKey, sentAt: msg.sentAt })),
        myTopicAnswers: (db.messages[m.matchId] ?? [])
          .filter((msg) => msg.topicAnswers?.mine)
          .map((msg) => ({ messageId: msg.id, value: msg.topicAnswers!.mine!, answeredAt: msg.sentAt })),
      })),
      guardians: db.guardians.map((g) => ({ ...g })),
      guardianOpinionsReceived: [],
      guardianOf: [],
      sharedWithGuardians: db.shares.map((x) => ({ ...x })),
      reportsFiled: db.reports.map((r, i) => ({
        id: `report_${i + 1}`,
        subjectId: r.subjectId,
        category: r.category,
        details: r.details ?? null,
        status: 'open',
        createdAt: ctx.now().toISOString(),
      })),
      blocks: db.blocked.map((id) => ({ subjectId: id, createdAt: s.blockedAt[id] ?? ctx.now().toISOString() })),
      consents: s.consents.map((c) => ({ ...c })),
      devices: [],
      notificationPrefs: null,
      notifications: [],
      passport: db.destinations.map((d) => ({ ...d })),
      subscriptions: db.tier === 'free' ? [] : [{ tier: db.tier, store: 'dev', status: 'active' }],
      purchases: [],
    };
  }

  return {
    status: () => ctx.op(status),

    pause: (until) =>
      ctx.op(() => {
        restricted();
        if (until !== null) {
          const end = new Date(until);
          if (Number.isNaN(end.getTime())) throw new ApiError(400, 'invalid_until', null);
          if (end <= ctx.now()) throw new ApiError(400, 'until_in_past', null);
          if (end.getTime() - ctx.now().getTime() > MAX_PAUSE_DAYS * DAY) throw new ApiError(400, 'pause_too_long', null);
        }
        const s = state();
        s.paused = true;
        s.pausedUntil = until;
        return status();
      }),

    resume: () =>
      ctx.op(() => {
        restricted();
        const s = state();
        s.paused = false;
        s.pausedUntil = null;
        return status();
      }),

    setIncognito: (on) =>
      ctx.op(() => {
        restricted();
        if (on && !canIncognito()) throw new ApiError(403, 'plan_required', { error: 'plan_required', feature: 'incognito' });
        state().incognito = on;
        return status();
      }),

    exportData: () => ctx.op(exportData),

    requestDeletion: () =>
      ctx.op(() => {
        const s = state();
        s.deletionRequestedAt ??= ctx.now().toISOString();
        return status();
      }),

    cancelDeletion: () =>
      ctx.op(() => {
        const s = state();
        if (s.deletionRequestedAt && new Date(s.deletionRequestedAt).getTime() + DELETION_GRACE_DAYS * DAY <= ctx.now().getTime()) {
          throw new ApiError(409, 'grace_period_over', { error: 'grace_period_over' });
        }
        s.deletionRequestedAt = null;
        return status();
      }),

    consents: () => ctx.op(() => state().consents),

    putConsent: (kind, granted) =>
      ctx.op(() => {
        if (!CONSENT_KINDS.includes(kind)) throw new ApiError(400, 'unknown_consent', null);
        if (!granted && REQUIRED_CONSENTS.includes(kind as ConsentKind)) throw new ApiError(400, 'consent_required', { error: 'consent_required', kind });
        const s = state();
        const entry: Consent = { kind, granted, version: CONSENT_VERSION, decidedAt: ctx.now().toISOString() };
        s.consents = [...s.consents.filter((c) => c.kind !== kind), entry];
        return s.consents;
      }),

    preferences: () =>
      ctx.op(() => {
        restricted();
        const prefs = ctx.db().prefs;
        return prefs ? { saved: true, preferences: prefs } : { saved: false, preferences: ctx.defaultPreferences() };
      }),

    blocks: () =>
      ctx.op(() => {
        restricted();
        ctx.ensureSeeds();
        const s = state();
        const db = ctx.db();
        return [...db.blocked].reverse().map((id) => {
          s.blockedAt[id] ??= ctx.now().toISOString();
          return { subjectId: id, firstName: firstName(id), blockedAt: s.blockedAt[id]! };
        });
      }),

    unblock: (subjectId) =>
      ctx.op(() => {
        restricted();
        const db = ctx.db();
        db.blocked = db.blocked.filter((id) => id !== subjectId);
        db.feedOrder = null;
        delete state().blockedAt[subjectId];
      }),

    guardianShares: () =>
      ctx.op(() => {
        restricted();
        ctx.ensureSeeds();
        return ctx.db().shares.map((x) => ({ subjectId: x.subjectId, firstName: firstName(x.subjectId), sharedAt: x.sharedAt }));
      }),
  };
}
