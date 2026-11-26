/**
 * In-memory mock backend implementing the full HalalMeetApi contract, so the app is demoable with
 * zero backend. Uses the real matching engine from @halal-meet/core (checkEligibility,
 * computeCompatibility, rankScore) and enforces PLAN_LIMITS.
 *
 * Demo notes:
 * - Any OTP code is accepted (use 000000).
 * - ~30% of interests become mutual (100% if they already liked you).
 * - Replies / topic-card answers arrive a few seconds after you write.
 * - State is snapshotted to the provided storage (AsyncStorage / localStorage) so a web reload keeps it.
 */
import {
  CORE_TOPIC_KEYS,
  COUNTRIES,
  DEFAULT_QUALITY_FLOOR,
  PLAN_LIMITS,
  QUESTIONS,
  QUESTIONS_BY_KEY,
  REVEAL_THRESHOLD,
  checkEligibility,
  computeCompatibility,
  passportCapacity,
  pick,
  defaultGuardianPermissions,
  rankScore,
  type Answer,
  type CompatibilityResult,
  type CompatibilityView,
  type CountryStatus,
  type Dimension,
  type Entitlements,
  type FeedItem,
  type FeedPage,
  type FeedSlot,
  type Gender,
  type Guardian,
  type GuardianDashboard,
  type GuardianInviteResponse,
  type GuardianLink,
  type GuardianOpinion,
  type GuardianOpinionValue,
  type GuardianPresence,
  type GuardianRelationship,
  type IncomingInterestsResponse,
  type InterestBody,
  type JourneyStage,
  type Locale,
  type MatchPreferencesInput,
  type MatchProfile,
  type MatchSummary,
  type MeResponse,
  type Message,
  type MyProfile,
  type PassportDestination,
  type PlanTier,
  type ProfileCard,
  type ProfileInput,
  type ReportBody,
  type Usage,
} from '@halal-meet/core';

import {
  buildGuardianDashboard,
  type DashboardApprovals,
  type DashboardMatchInput,
  type DashboardSharedInput,
} from '../../lib/guardianDashboard';
import { ApiError, LimitReachedError, type HalalMeetApi } from '../types';
import {
  ABOUT,
  EDUCATION,
  INTEREST_NOTES,
  PROFESSIONS,
  REPLIES,
  SAFE_REPLY,
  SEED_CONVERSATION,
  STAGE_NAMES,
  SYSTEM_TEXT,
  byAuthor,
  detectRisk,
} from './content';
import { createMockAdmin } from './admin';
import { createMockPrivacyApi } from './privacy';
import { createMockNotifications } from './notifications';
import { createMockPhotoApi } from './photos';
import { hashString, Rng } from './rng';
import { generateSeeds, type SeedProfile } from './seed';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface MockApiOptions {
  storage?: KeyValueStorage;
  /** Simulated network latency in ms (0 in tests). */
  latencyMs?: number;
  /** Delay before simulated replies arrive. */
  replyDelayMs?: number;
  now?: () => Date;
  /** UI locale, used to localise seeded names/bios and simulated replies. */
  getLocale?: () => Locale;
  /** Probability that an interest becomes mutual (default 0.3). */
  mutualRate?: number;
}

interface StoredProfile extends ProfileInput {
  id: string;
  photoUrl: string | null;
  verifications: MyProfile['verifications'];
}

interface MockMatch {
  matchId: string;
  otherId: string;
  createdAt: string;
  stage: JourneyStage;
  status: 'active' | 'closed';
  /** Both tapped ready for this stage, but a guardian approval is still missing (added later; may be absent). */
  awaiting?: 5 | 6 | null;
}

/** A stage decision from one of the member's own guardians (simulated in the demo). */
interface MockStageApproval {
  guardianId: string;
  matchId: string;
  stage: 5 | 6;
  decision: 'approve' | 'discuss';
  at: string;
}

interface PendingEvent {
  due: number;
  kind: 'reply' | 'topic_answer' | 'topic_card';
  matchId: string;
  messageId?: string;
  risky?: boolean;
}

/** A guardian this account invited. `code` is the currently valid invitation code (null once accepted). */
interface MockGuardian extends Guardian {
  code: string | null;
}

interface MockGuardianOpinion {
  guardianId: string;
  subjectId: string;
  opinion: GuardianOpinionValue;
  note: string | null;
  updatedAt: string;
}

/** This account acting as a guardian for someone else (only the fictional demo member in the mock). */
interface MockGuardianLink extends GuardianLink {
  acceptedAt: string;
}

interface MockDb {
  version: 3;
  accountId: string;
  phone: string | null;
  locale: Locale;
  profile: StoredProfile | null;
  answers: Answer[];
  prefs: MatchPreferencesInput | null;
  dimensionImportance: Partial<Record<Dimension, MatchPreferencesInput['dimensionImportance'][Dimension]>>;
  tier: PlanTier;
  passportAddon: boolean;
  passExpiresAt: string | null;
  freePassUsedAt: string | null;
  destinations: PassportDestination[];
  seeds: SeedProfile[];
  seedKey: string | null;
  sent: Array<{ toId: string; level: 'interest' | 'serious'; at: string; note: string | null }>;
  passes: Record<string, string>;
  inbound: Array<{ fromId: string; level: 'interest' | 'serious'; at: string; note: string | null }>;
  matches: MockMatch[];
  messages: Record<string, Message[]>;
  /** Hidden "their" answers for topic cards, revealed once both answered. */
  topicTheirs: Record<string, string>;
  pending: PendingEvent[];
  blocked: string[];
  reports: ReportBody[];
  replyCursor: number;
  feedOrder: string[] | null;
  seq: number;
  // Guardians (added after v3 shipped; `normalize()` fills them in for older snapshots)
  guardians: MockGuardian[];
  guardianOpinions: MockGuardianOpinion[];
  /** Codes that were accepted, so re-using one answers 409 rather than 404. */
  usedGuardianCodes: string[];
  guardianLinks: MockGuardianLink[];
  /** Opinions this account left as a guardian: memberId → subjectId → opinion. */
  myGuardianOpinions: Record<string, Record<string, { value: GuardianOpinionValue; note: string | null; updatedAt: string }>>;
  /** Stage decisions from the member's own guardians (dev.simulateGuardianApproval). */
  stageApprovals: MockStageApproval[];
  /** Profiles the member shared with their guardians (POST /guardians/shares). */
  shares: Array<{ subjectId: string; sharedAt: string }>;
  /** Decisions this account made as a guardian: memberId → matchId → decision. */
  myGuardianApprovals: Record<string, DashboardApprovals>;
  /** Stage changes of the fictional demo member's introductions (after this account approved). */
  demoStages: Record<string, JourneyStage>;
}

const STORAGE_KEY = 'hm.mockdb.v3';
const OPEN_COUNTRIES = new Set(['EG', 'SA', 'AE', 'GB', 'US']);
const PAGE_SIZE = 10;
const DAY = 86400000;

function freshDb(): MockDb {
  return {
    version: 3,
    accountId: 'acc_demo',
    phone: null,
    locale: 'en',
    profile: null,
    answers: [],
    prefs: null,
    dimensionImportance: {},
    tier: 'free',
    passportAddon: false,
    passExpiresAt: null,
    freePassUsedAt: null,
    destinations: [],
    seeds: [],
    seedKey: null,
    sent: [],
    passes: {},
    inbound: [],
    matches: [],
    messages: {},
    topicTheirs: {},
    pending: [],
    blocked: [],
    reports: [],
    replyCursor: 0,
    feedOrder: null,
    seq: 1,
    guardians: [],
    guardianOpinions: [],
    usedGuardianCodes: [],
    guardianLinks: [],
    myGuardianOpinions: {},
    stageApprovals: [],
    shares: [],
    myGuardianApprovals: {},
    demoStages: {},
  };
}

/** Fills in fields added after a snapshot was written. */
function normalize(db: MockDb): MockDb {
  db.guardians ??= [];
  db.guardianOpinions ??= [];
  db.usedGuardianCodes ??= [];
  db.guardianLinks ??= [];
  db.myGuardianOpinions ??= {};
  db.stageApprovals ??= [];
  db.shares ??= [];
  db.myGuardianApprovals ??= {};
  db.demoStages ??= {};
  return db;
}

/**
 * A standing invitation from a fictional member, so the guardian side can be tried on the same device
 * (accepting your own invitation is refused with `cannot_guard_self`, as on the server).
 */
export const DEMO_GUARDIAN_CODE = 'DEMOWALI';
const DEMO_MEMBER_ID = 'mem_demo';
const DEMO_MEMBER = {
  name: ['Maryam', 'مريم'] as const,
  gender: 'female' as const,
  halalMode: 'wali' as const,
  relationship: 'father' as GuardianRelationship,
};
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function newInviteCode(): string {
  let out = '';
  for (let i = 0; i < 8; i++) out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return out;
}

/** Demo codes are 8 letters/digits; accept them typed loosely (`k7q2-m9xa`). Real server codes are exact. */
function normalizeCode(code: string): string {
  return code.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

/** Example opinions seeded when a guardian "accepts" in the demo. */
const SEED_OPINIONS: Array<{ opinion: GuardianOpinionValue; note: { en: string; ar: string } }> = [
  {
    opinion: 'support',
    note: {
      en: 'I see good in this introduction. I am comfortable with you continuing, in shaa Allah.',
      ar: 'أرى في هذا التعارف خيرًا إن شاء الله، ولا مانع عندي من الاستمرار.',
    },
  },
  {
    opinion: 'discuss',
    note: {
      en: 'Let us talk together about where you would live after marriage before the next stage.',
      ar: 'لنتحدث معًا عن مكان السكن بعد الزواج قبل الانتقال إلى المرحلة التالية.',
    },
  },
];

function ageFrom(birthDate: string, now: Date): number {
  const b = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(b.getTime())) return 30;
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function createMockApi(opts: MockApiOptions = {}): HalalMeetApi {
  const latency = opts.latencyMs ?? 250;
  const replyDelay = opts.replyDelayMs ?? 2500;
  const now = opts.now ?? (() => new Date());
  const mutualRate = opts.mutualRate ?? 0.3;
  const storage = opts.storage;
  let db: MockDb = freshDb();
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const ready: Promise<void> = (async () => {
    if (!storage) return;
    try {
      const raw = await storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MockDb;
        if (parsed.version === 3) db = normalize(parsed);
      }
    } catch {
      db = freshDb();
    }
  })();

  function persist() {
    if (!storage) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      storage.setItem(STORAGE_KEY, JSON.stringify(db)).catch(() => undefined);
    }, 200);
  }

  async function op<T>(fn: () => T): Promise<T> {
    await ready;
    if (latency > 0) await new Promise((r) => setTimeout(r, latency * (0.6 + Math.random() * 0.8)));
    flushPending();
    const out = fn();
    persist();
    // structuredClone-ish copy so React Query never shares mutable objects with the db
    return out === undefined ? out : (JSON.parse(JSON.stringify(out)) as T);
  }

  const locale = (): Locale => opts.getLocale?.() ?? db.locale;
  const nextId = (prefix: string) => `${prefix}_${(db.seq++).toString(36)}`;
  const seedById = (id: string) => db.seeds.find((s) => s.id === id);
  const viewerGender = (): Gender => db.profile?.gender ?? 'male';

  // Notifications inbox (see ./notifications.ts): demo events below call notifMock.add().
  const notifMock = createMockNotifications({ op, db: () => db, now, isFree: () => db.tier === 'free', nameOf: (id) => seedById(id)?.name[locale() === 'ar' ? 1 : 0] ?? null });

  // Moderation console (separate store; see ./admin.ts). Imports the reports you file here.
  const adminMock = createMockAdmin({
    storage,
    latencyMs: latency,
    now,
    getLocale: () => locale(),
    accountId: () => db.accountId,
    me: () => (db.profile ? { firstName: db.profile.firstName, gender: db.profile.gender, country: db.profile.country, city: db.profile.city } : null),
    userReports: () => db.reports,
    member: (id) => {
      const s = seedById(id);
      return s ? { names: s.name, gender: s.match.gender, age: s.match.age, country: s.match.country, city: s.match.city, verified: s.verifications.includes('identity') } : null;
    },
    conversationWith: (id) => db.matches.filter((m) => m.otherId === id).flatMap((m) => db.messages[m.matchId] ?? []),
  });

  // Photos & photo privacy (state lives in db.photoMock; see ./photos.ts).
  const photoMock = createMockPhotoApi({
    op,
    db: () => db,
    now,
    requesters: () =>
      db.seeds
        .filter((x) => x.match.gender !== viewerGender())
        .slice(3, 5)
        .map((x) => ({
          id: x.id,
          firstName: locale() === 'ar' ? x.name[1] : x.name[0],
          gender: x.match.gender,
          age: x.match.age,
          country: x.match.country,
          city: x.match.city,
          photoUrl: null,
          photoState: x.photoState,
        })),
    seedPhotoState: (id) => seedById(id)?.photoState ?? null,
  });

  // ───────── derived state ─────────

  function tierLimits() {
    return PLAN_LIMITS[db.tier];
  }

  function passActive(): boolean {
    return !!db.passExpiresAt && new Date(db.passExpiresAt) > now();
  }

  function activeDestinations(): PassportDestination[] {
    const t = now();
    return db.destinations.filter(
      (d) => d.status !== 'cancelled' && d.status !== 'expired' && (!d.activeUntil || new Date(d.activeUntil) > t),
    );
  }

  function identityVerified(): boolean {
    return !!db.profile?.verifications.includes('identity');
  }

  function myMatchProfile(): MatchProfile | null {
    const p = db.profile;
    if (!p) return null;
    const age = ageFrom(p.birthDate, now());
    const prefs = db.prefs ?? defaultPrefs(p.gender, age);
    return {
      id: p.id,
      gender: p.gender,
      age,
      country: p.country,
      city: p.city,
      languages: p.languages,
      maritalStatus: p.maritalStatus,
      hasChildren: p.hasChildren,
      intention: p.intention,
      halalMode: p.halalMode,
      acceptedModes: p.acceptedModes,
      identityVerified: identityVerified(),
      openToRelocate: p.openToRelocate,
      relocateCountries: p.relocateCountries,
      intlVisibility: p.intlVisibility,
      answers: db.answers,
      dimensionImportance: prefs.dimensionImportance,
      preferences: {
        ageMin: prefs.ageMin,
        ageMax: prefs.ageMax,
        maritalStatuses: prefs.maritalStatuses,
        acceptChildren: prefs.acceptChildren,
        verifiedOnly: prefs.verifiedOnly,
        languages: prefs.languages,
      },
      passport: activeDestinations(),
    };
  }

  function defaultPrefs(gender: Gender, age: number): MatchPreferencesInput {
    return gender === 'female'
      ? { ageMin: Math.max(18, age - 2), ageMax: age + 10, maritalStatuses: null, acceptChildren: true, verifiedOnly: false, languages: null, dimensionImportance: {} }
      : { ageMin: Math.max(18, age - 10), ageMax: age + 4, maritalStatuses: null, acceptChildren: true, verifiedOnly: false, languages: null, dimensionImportance: {} };
  }

  const ctx = () => ({
    now: now(),
    countryStatus: (c: string): CountryStatus => (OPEN_COUNTRIES.has(c) ? 'open' : 'growing'),
  });

  function usage(): Usage {
    const t = now();
    const today = startOfDay(t).getTime();
    const limits = tierLimits();
    const windowStart = t.getTime() - limits.seriousInterest.windowDays * DAY;
    return {
      interestsToday: db.sent.filter((s) => s.level === 'interest' && new Date(s.at).getTime() >= today).length,
      interestsLimit: limits.dailyInterests,
      seriousUsed: db.sent.filter((s) => s.level === 'serious' && new Date(s.at).getTime() >= windowStart).length,
      seriousLimit: limits.seriousInterest.count,
      topPicksPerDay: limits.topPicksPerDay,
      resetsAt: new Date(today + DAY).toISOString(),
    };
  }

  /** GET /me/billing in the demo: everything is a dev grant (no store, no management link). */
  function mockBilling(): import('@halal-meet/core').MeBillingResponse {
    const renews = new Date(now().getTime() + 30 * DAY).toISOString();
    const subscriptions: import('@halal-meet/core').BillingSubscriptionView[] = [];
    if (db.tier === 'plus' || db.tier === 'gold' || db.tier === 'elite') {
      const sku = db.tier === 'plus' ? ('plus_monthly' as const) : db.tier === 'gold' ? ('gold_monthly' as const) : null;
      subscriptions.push({ id: 'mock-plan', sku, tier: db.tier, store: 'dev', status: 'active', currentPeriodEnd: renews, autoRenew: true, billingIssue: false, managementUrl: null });
    }
    if (db.passportAddon) {
      subscriptions.push({ id: 'mock-addon', sku: 'passport_addon_monthly', tier: 'passport_addon', store: 'dev', status: 'active', currentPeriodEnd: renews, autoRenew: true, billingIssue: false, managementUrl: null });
    }
    const passes = passActive() && db.passExpiresAt ? [{ id: 'mock-pass', sku: 'passport_pass_7d' as const, store: 'dev', expiresAt: db.passExpiresAt, free: false }] : [];
    return { tier: db.tier, subscriptions, passes, managementUrl: null, devGrantAvailable: true, storeSyncAvailable: false };
  }

  function entitlements(): Entitlements {
    const limits = tierLimits();
    const capacity = passportCapacity(db.tier, db.passportAddon, passActive());
    const source: Entitlements['passport']['source'] =
      limits.passport.maxDestinations > 0 ? 'plan' : db.passportAddon ? 'addon' : passActive() ? 'pass' : 'none';
    const freePassAvailable =
      limits.passport.quarterlyFreePass && (!db.freePassUsedAt || now().getTime() - new Date(db.freePassUsedAt).getTime() > 90 * DAY);
    return {
      tier: db.tier,
      limits,
      passport: { capacity, source, passExpiresAt: passActive() ? db.passExpiresAt : null, freePassAvailable },
    };
  }

  function profileStrength(): number {
    const p = db.profile;
    if (!p) return 0;
    let s = 30;
    if (p.photoUrl) s += 10;
    if (p.about) s += 10;
    if (p.profession) s += 5;
    if (identityVerified()) s += 15;
    s += Math.round((Math.min(db.answers.length, 20) / 20) * 30);
    return Math.min(100, s);
  }

  function myProfile(): MyProfile | null {
    const p = db.profile;
    if (!p) return null;
    return { ...p, age: ageFrom(p.birthDate, now()), profileStrength: profileStrength() };
  }

  // ───────── seeding ─────────

  function ensureSeeds() {
    const p = db.profile;
    if (!p) return;
    const key = `${p.country}:${p.gender}`;
    if (db.seedKey === key) return;
    if (db.seedKey && db.matches.length > 0) return; // keep the world stable once relationships exist
    db.seeds = generateSeeds({ homeCountry: p.country, viewerGender: p.gender, now: now() });
    db.seedKey = key;
    db.feedOrder = null;
    seedRelationships();
  }

  /** A few people already interested in you and two ongoing conversations, so every tab has content. */
  function seedRelationships() {
    const p = db.profile!;
    const rng = new Rng(`rel:${db.seedKey}`);
    const local = rng.shuffle(db.seeds.filter((s) => s.match.gender !== p.gender && s.match.country === p.country));
    // The first conversation is with someone in Wali mode, so their guardian's presence shows in the demo.
    const waliAt = local.findIndex((s) => s.match.halalMode === 'wali');
    if (waliAt > 0) local.unshift(...local.splice(waliAt, 1));
    const t = now().getTime();
    const loc = locale();

    db.inbound = [];
    db.matches = [];
    db.messages = {};

    // Two existing conversations (one waiting on you, one waiting on them)
    local.slice(0, 2).forEach((s, i) => {
      const matchId = `m_${s.id}`;
      db.matches.push({ matchId, otherId: s.id, createdAt: new Date(t - (3 - i) * DAY).toISOString(), stage: (i === 0 ? 2 : 1) as JourneyStage, status: 'active' });
      const convo = i === 0 ? SEED_CONVERSATION : SEED_CONVERSATION.slice(0, 3);
      db.messages[matchId] = convo.map((m, j) => ({
        id: nextId('msg'),
        matchId,
        senderId: m.fromMe ? p.id : s.id,
        kind: 'text' as const,
        body: byAuthor(m.text, loc, m.fromMe ? p.gender : s.match.gender),
        topicKey: null,
        topicAnswers: null,
        sentAt: new Date(t - (3 - i) * DAY + j * 3600000).toISOString(),
        risk: null,
      }));
      if (i === 0) {
        // one revealed topic card in the first conversation
        const topicKey = 'living_arrangement';
        const theirs = (s.match.answers.find((a) => a.questionKey === topicKey)?.self as string | null) ?? 'independent';
        const mine = (db.answers.find((a) => a.questionKey === topicKey)?.self as string | null) ?? 'independent';
        db.messages[matchId]!.splice(2, 0, {
          id: nextId('msg'),
          matchId,
          senderId: s.id,
          kind: 'topic_card',
          body: pick(QUESTIONS_BY_KEY[topicKey]!.text, loc, p.gender),
          topicKey,
          topicAnswers: { mine, theirs, revealed: true },
          sentAt: new Date(t - 3 * DAY + 2 * 3600000).toISOString(),
          risk: null,
        });
      }
    });

    // Incoming interests: one serious with a note, a handful of regular ones
    local.slice(2, 8).forEach((s, i) => {
      db.inbound.push({
        fromId: s.id,
        level: i === 0 ? 'serious' : 'interest',
        at: new Date(t - i * 5 * 3600000).toISOString(),
        note: i === 0 ? byAuthor(INTEREST_NOTES[0]!, loc, s.match.gender) : null,
      });
      notifMock.add(i === 0 ? 'serious_interest' : 'interest', { fromId: s.id, level: i === 0 ? 'serious' : 'interest' }, new Date(t - i * 5 * 3600000));
    });
  }

  // ───────── cards ─────────

  function compatFor(seed: SeedProfile): CompatibilityResult | null {
    const me = myMatchProfile();
    if (!me) return null;
    return computeCompatibility(me, seed.match);
  }

  function gateCompat(c: CompatibilityResult | null): CompatibilityView {
    if (!c) return { displayPct: 0, dims: {}, reasons: [], discuss: [], truncated: true };
    const depth = tierLimits().compatibilityDepth;
    if (depth !== 'basic') {
      return { displayPct: c.displayPct, dims: c.dims, reasons: c.reasons, discuss: c.discuss, truncated: false };
    }
    // Free: overall + top 3 reasons + 1 discuss flag. Unrevealed dims are kept (score hidden) so the
    // client can show the free "Answer N more to reveal" hook.
    const dims: CompatibilityView['dims'] = {};
    for (const [d, s] of Object.entries(c.dims) as Array<[Dimension, NonNullable<CompatibilityView['dims'][Dimension]>]>) {
      if (!s.revealed) dims[d] = { ...s, score: 0 };
    }
    return { displayPct: c.displayPct, dims, reasons: c.reasons.slice(0, 3), discuss: c.discuss.slice(0, 1), truncated: true };
  }

  function cardFor(seed: SeedProfile, compat?: CompatibilityResult | null): ProfileCard {
    const loc = locale();
    const g = seed.match.gender;
    const inbound = db.inbound.find((x) => x.fromId === seed.id);
    const pass = seed.match.passport[0];
    return {
      id: seed.id,
      firstName: loc === 'ar' ? seed.name[1] : seed.name[0],
      gender: g,
      age: seed.match.age,
      country: seed.match.country,
      city: seed.match.city,
      photoUrl: null,
      photoState: photoMock.stateFor(seed.id, seed.photoState),
      verifications: seed.verifications,
      halalMode: seed.match.halalMode,
      intention: seed.match.intention,
      maritalStatus: seed.match.maritalStatus,
      hasChildren: seed.match.hasChildren,
      profession: byAuthor(PROFESSIONS[seed.professionIdx]!, loc, g),
      educationLevel: byAuthor(EDUCATION[seed.educationIdx]!, loc, g),
      about: byAuthor(ABOUT[seed.aboutIdx]!, loc, g),
      languages: seed.match.languages,
      passport: pass
        ? {
            homeCountry: seed.match.country,
            homeCity: seed.match.city,
            destinationCountry: pass.country,
            purpose: pass.purpose,
            visitFrom: pass.visitFrom,
            visitTo: pass.visitTo,
          }
        : null,
      compatibility: gateCompat(compat === undefined ? compatFor(seed) : compat),
      keyFacts: seed.keyFacts,
      isNew: now().getTime() - new Date(seed.joinedAt).getTime() < 3 * DAY,
      sentYouSeriousInterest: inbound?.level === 'serious',
    };
  }

  // ───────── feed ─────────

  function actedOn(id: string): boolean {
    return (
      !!db.passes[id] ||
      db.sent.some((s) => s.toId === id) ||
      db.matches.some((m) => m.otherId === id) ||
      db.blocked.includes(id)
    );
  }

  interface Ranked {
    seed: SeedProfile;
    compat: CompatibilityResult;
    rank: number;
  }

  function eligibleRanked(opts: { destinations?: PassportDestination[]; includeActed?: boolean } = {}): Ranked[] {
    const me = myMatchProfile();
    if (!me) return [];
    if (opts.destinations) me.passport = opts.destinations;
    const c = ctx();
    const dests = me.passport;
    const out: Ranked[] = [];
    for (const seed of db.seeds) {
      if (!opts.includeActed && actedOn(seed.id)) continue;
      // While Passport is active, the feed switches to the destination(s).
      if (dests.length > 0) {
        const covered = dests.some((d) => d.isWorldwide || d.country === seed.match.country);
        if (!covered) continue;
      }
      if (!checkEligibility(me, seed.match, c).ok) continue;
      const compat = computeCompatibility(me, seed.match);
      const rank = rankScore({
        overall: compat.overall,
        pMutual: seed.pMutual,
        responsiveness: seed.responsiveness,
        freshness: now().getTime() - new Date(seed.joinedAt).getTime() < 3 * DAY ? 1 : 0.4,
        verification: seed.match.identityVerified ? 1 : 0.3,
        completeness: seed.match.answers.length / QUESTIONS.length,
        penalty: 0,
      });
      out.push({ seed, compat, rank });
    }
    return out.sort((a, b) => b.rank - a.rank);
  }

  function buildFeedOrder(): string[] {
    const ranked = eligibleRanked();
    const serious = ranked.filter((r) => db.inbound.some((x) => x.fromId === r.seed.id && x.level === 'serious'));
    const rest = ranked.filter((r) => !serious.includes(r));
    const core = rest.filter((r) => r.compat.displayPct >= DEFAULT_QUALITY_FLOOR);
    const broader = rest.filter((r) => r.compat.displayPct < DEFAULT_QUALITY_FLOOR);
    return [...serious, ...core, ...broader].map((r) => r.seed.id);
  }

  function slotFor(seed: SeedProfile, compat: CompatibilityResult): FeedSlot {
    const inbound = db.inbound.find((x) => x.fromId === seed.id);
    if (inbound?.level === 'serious') return 'pinned_serious';
    if (compat.displayPct < DEFAULT_QUALITY_FLOOR) return 'broader';
    if (inbound) return 'inbound';
    if (now().getTime() - new Date(seed.joinedAt).getTime() < 3 * DAY) return 'new_member';
    return 'core';
  }

  function unansweredQuestion(dimension?: Dimension): string | null {
    const answered = new Set(db.answers.map((a) => a.questionKey));
    const q = QUESTIONS.find((x) => !answered.has(x.key) && (!dimension || x.dimension === dimension));
    return q?.key ?? null;
  }

  function revealCandidate(): { dimension: Dimension; questionsNeeded: number } | null {
    for (const [d, need] of Object.entries(REVEAL_THRESHOLD) as Array<[Dimension, number]>) {
      const have = db.answers.filter((a) => QUESTIONS_BY_KEY[a.questionKey]?.dimension === d).length;
      if (have < need + 1 && unansweredQuestion(d)) return { dimension: d, questionsNeeded: Math.max(1, need + 1 - have) };
    }
    return null;
  }

  function passportSuggestions(): Array<{ country: string; compatibleCount: number }> {
    const p = db.profile;
    if (!p) return [];
    const t = now();
    return COUNTRIES.filter((c) => c.code !== p.country)
      .map((c) => {
        const virtual: PassportDestination = {
          id: 'virtual',
          country: c.code,
          city: null,
          purpose: 'either',
          visitFrom: null,
          visitTo: null,
          visibleFrom: t.toISOString(),
          activeUntil: null,
          status: 'active',
          isWorldwide: false,
        };
        return { country: c.code, compatibleCount: eligibleRanked({ destinations: [virtual] }).length };
      })
      .filter((s) => s.compatibleCount > 0)
      .sort((a, b) => b.compatibleCount - a.compatibleCount)
      .slice(0, 8);
  }

  function feedPage(cursor: string | null | undefined): FeedPage {
    ensureSeeds();
    const p = db.profile;
    if (!p) throw new ApiError(409, 'profile_required', null);
    if (!cursor || !db.feedOrder) db.feedOrder = buildFeedOrder();
    const order = db.feedOrder;
    const offset = cursor ? Number(cursor) || 0 : 0;
    const slice = order.slice(offset, offset + PAGE_SIZE);
    const items: FeedItem[] = [];
    const isFree = db.tier === 'free';
    let dividerShown = offset > 0 && order.slice(0, offset).some((id) => {
      const s = seedById(id);
      const c = s ? compatFor(s) : null;
      return !!c && c.displayPct < DEFAULT_QUALITY_FLOOR && !db.inbound.some((x) => x.fromId === id && x.level === 'serious');
    });

    slice.forEach((id, i) => {
      const seed = seedById(id);
      if (!seed || db.blocked.includes(id)) return;
      const compat = compatFor(seed)!;
      const slot = slotFor(seed, compat);
      if (slot === 'broader' && !dividerShown) {
        items.push({ type: 'divider', kind: 'broader_matches' });
        dividerShown = true;
      }
      items.push({ type: 'profile', slot, card: cardFor(seed, compat) });
      const globalIndex = offset + i + 1;
      if (globalIndex === 3) {
        const q = unansweredQuestion();
        if (q) items.push({ type: 'inline', kind: 'daily_question', questionKey: q });
      } else if (globalIndex === 12) {
        const r = revealCandidate();
        if (r) items.push({ type: 'inline', kind: 'reveal', ...r });
      } else if (globalIndex === 20 && isFree) {
        items.push({ type: 'inline', kind: 'upsell', sku: 'plus_monthly', reason: 'interests' });
      } else if (globalIndex === 60 && usage().interestsToday === 0) {
        items.push({ type: 'inline', kind: 'mindful_browsing' });
      }
    });

    const nextOffset = offset + PAGE_SIZE;
    const endOfPool = nextOffset >= order.length;
    const dests = activeDestinations();
    const homeStatus = ctx().countryStatus(p.country);
    const regionCountries = COUNTRIES.filter((c) => c.region === COUNTRIES.find((x) => x.code === p.country)?.region).map((c) => c.code);
    return {
      items,
      nextCursor: endOfPool ? null : String(nextOffset),
      endOfPool,
      newSinceLastVisit: offset === 0 ? order.filter((id) => slotFor(seedById(id)!, compatFor(seedById(id)!)!) === 'new_member').length : 0,
      scope:
        dests.length > 0
          ? { kind: 'passport', countries: dests.map((d) => d.country), region: null, countryStatus: homeStatus }
          : homeStatus === 'growing'
            ? { kind: 'region', countries: regionCountries, region: COUNTRIES.find((c) => c.code === p.country)?.region ?? null, countryStatus: homeStatus }
            : { kind: 'country', countries: [p.country], region: null, countryStatus: homeStatus },
      passportSuggestions: endOfPool ? passportSuggestions() : [],
    };
  }

  // ───────── matches & messages ─────────

  function createMatch(otherId: string): MockMatch {
    const existing = db.matches.find((m) => m.otherId === otherId);
    if (existing) return existing;
    const m: MockMatch = { matchId: `m_${otherId}`, otherId, createdAt: now().toISOString(), stage: 1, status: 'active' };
    db.matches.push(m);
    db.messages[m.matchId] = [systemMessage(m.matchId, byAuthor(SYSTEM_TEXT.matched, locale(), viewerGender()))];
    return m;
  }

  function systemMessage(matchId: string, body: string): Message {
    return { id: nextId('msg'), matchId, senderId: null, kind: 'system', body, topicKey: null, topicAnswers: null, sentAt: now().toISOString(), risk: null };
  }

  function coveredTopics(matchId: string): Set<string> {
    const covered = new Set<string>();
    for (const m of db.messages[matchId] ?? []) {
      if (m.kind === 'topic_card' && m.topicKey && m.topicAnswers?.revealed && CORE_TOPIC_KEYS.includes(m.topicKey)) covered.add(m.topicKey);
    }
    return covered;
  }

  function derivedStage(m: MockMatch): JourneyStage {
    const n = coveredTopics(m.matchId).size;
    const fromTopics: JourneyStage = n >= 9 ? 4 : n >= 5 ? 3 : n >= 2 ? 2 : 1;
    return Math.max(m.stage, fromTopics) as JourneyStage;
  }

  function summary(m: MockMatch): MatchSummary | null {
    const seed = seedById(m.otherId);
    if (!seed) return null;
    const msgs = (db.messages[m.matchId] ?? []).filter((x) => x.kind !== 'system');
    const last = msgs[msgs.length - 1];
    const myId = db.profile?.id;
    return {
      matchId: m.matchId,
      other: cardFor(seed),
      stage: derivedStage(m),
      topicsCovered: coveredTopics(m.matchId).size,
      topicsTotal: CORE_TOPIC_KEYS.length,
      lastMessage: last ? { body: last.kind === 'topic_card' ? `🗂 ${last.body}` : last.body, at: last.sentAt, fromMe: last.senderId === myId } : null,
      yourMove: m.status === 'active' && (!last || last.senderId !== myId),
      firstMessageDue: msgs.length === 0 ? new Date(new Date(m.createdAt).getTime() + 7 * DAY).toISOString() : null,
      status: m.status,
      guardians: { mine: liveGuardians().map(presenceOf), theirs: theirGuardians(seed) },
      pendingGuardianApproval:
        m.awaiting && m.status === 'active' ? { stage: m.awaiting, mine: needsMyApproval(m, m.awaiting), theirs: false } : null,
    };
  }

  // ───────── guardian presence + stage approvals ─────────

  /** The member's guardians that count: accepted, active (not paused). */
  function liveGuardians(): MockGuardian[] {
    return db.guardians.filter((g) => g.accepted && g.status === 'active');
  }

  function presenceOf(g: Guardian): GuardianPresence {
    return { relationship: g.relationship, readsConversation: g.permissions.read_conversations, participates: g.permissions.participate };
  }

  /** Seeded members in Wali mode have a father who reads and takes part (deterministic). They never gate stages. */
  function theirGuardians(seed: SeedProfile): GuardianPresence[] {
    return seed.match.halalMode === 'wali' ? [{ relationship: 'father', readsConversation: true, participates: true }] : [];
  }

  function approvers(): MockGuardian[] {
    return liveGuardians().filter((g) => g.permissions.approve_stages);
  }

  /** True while the member has an approving guardian and none of them approved this match + stage. */
  function needsMyApproval(m: MockMatch, stage: 5 | 6): boolean {
    const ids = approvers().map((g) => g.id);
    if (ids.length === 0) return false;
    return !db.stageApprovals.some((a) => a.matchId === m.matchId && a.stage === stage && a.decision === 'approve' && ids.includes(a.guardianId));
  }

  function advanceTo(m: MockMatch, stage: JourneyStage) {
    m.stage = stage;
    m.awaiting = null;
    const name = STAGE_NAMES[stage - 1]!;
    const text = byAuthor(SYSTEM_TEXT.stage, locale(), viewerGender())
      .replace('{n}', String(stage))
      .replace('{name}', byAuthor(name, locale(), viewerGender()));
    (db.messages[m.matchId] ??= []).push(systemMessage(m.matchId, text));
  }

  /** Moves a held match forward once nothing is missing any more (approval given, guardian removed or paused). */
  function evaluateGate(m: MockMatch) {
    if (!m.awaiting || m.status !== 'active') return;
    if (!needsMyApproval(m, m.awaiting)) advanceTo(m, m.awaiting);
  }

  function sanitize(msg: Message): Message {
    if (msg.kind !== 'topic_card' || !msg.topicAnswers) return msg;
    if (msg.topicAnswers.revealed) return msg;
    return { ...msg, topicAnswers: { ...msg.topicAnswers, theirs: null } };
  }

  function theirAnswerFor(seed: SeedProfile, topicKey: string): string {
    const a = seed.match.answers.find((x) => x.questionKey === topicKey);
    const v = Array.isArray(a?.self) ? a?.self[0] : a?.self;
    if (v) return v;
    const q = QUESTIONS_BY_KEY[topicKey];
    return a?.accept?.[0] ?? q?.options[0]?.value ?? 'flexible';
  }

  function flushPending() {
    const t = now().getTime();
    const due = db.pending.filter((e) => e.due <= t);
    if (due.length === 0) return;
    db.pending = db.pending.filter((e) => e.due > t);
    for (const e of due) {
      const m = db.matches.find((x) => x.matchId === e.matchId);
      if (!m || m.status !== 'active') continue;
      const seed = seedById(m.otherId);
      if (!seed) continue;
      const list = (db.messages[m.matchId] ??= []);
      const at = new Date(e.due).toISOString();
      if (e.kind === 'reply') {
        const text = e.risky ? SAFE_REPLY : REPLIES[db.replyCursor++ % REPLIES.length]!;
        list.push({ id: nextId('msg'), matchId: m.matchId, senderId: seed.id, kind: 'text', body: byAuthor(text, locale(), seed.match.gender), topicKey: null, topicAnswers: null, sentAt: at, risk: null });
        notifMock.add('message', { matchId: m.matchId, messageId: list[list.length - 1]!.id, senderId: seed.id }, new Date(e.due));
      } else if (e.kind === 'topic_answer' && e.messageId) {
        const msg = list.find((x) => x.id === e.messageId);
        if (msg?.topicKey && msg.topicAnswers) {
          db.topicTheirs[msg.id] = theirAnswerFor(seed, msg.topicKey);
          if (msg.topicAnswers.mine) msg.topicAnswers = { mine: msg.topicAnswers.mine, theirs: db.topicTheirs[msg.id]!, revealed: true };
        }
      } else if (e.kind === 'topic_card') {
        const covered = coveredTopics(m.matchId);
        const pending = new Set(list.filter((x) => x.kind === 'topic_card').map((x) => x.topicKey));
        const topicKey = CORE_TOPIC_KEYS.find((k) => !covered.has(k) && !pending.has(k));
        if (!topicKey) continue;
        const id = nextId('msg');
        db.topicTheirs[id] = theirAnswerFor(seed, topicKey);
        list.push({
          id,
          matchId: m.matchId,
          senderId: seed.id,
          kind: 'topic_card',
          body: pick(QUESTIONS_BY_KEY[topicKey]!.text, locale(), viewerGender()),
          topicKey,
          topicAnswers: { mine: null, theirs: null, revealed: false },
          sentAt: at,
          risk: null,
        });
      }
    }
  }

  function requireMatch(matchId: string): MockMatch {
    const m = db.matches.find((x) => x.matchId === matchId);
    if (!m) throw new ApiError(404, 'match_not_found', null);
    return m;
  }

  function interest(body: InterestBody) {
    ensureSeeds();
    const seed = seedById(body.toId);
    if (!seed) throw new ApiError(404, 'profile_not_found', null);
    const u = usage();
    if (body.level === 'interest' && u.interestsLimit !== null && u.interestsToday >= u.interestsLimit) {
      throw new LimitReachedError(u, 'interests', { error: 'limit_reached', usage: u });
    }
    if (body.level === 'serious' && u.seriousUsed >= u.seriousLimit) {
      throw new LimitReachedError(u, 'serious', { error: 'limit_reached', usage: u });
    }
    db.sent.push({ toId: body.toId, level: body.level, at: now().toISOString(), note: body.note ?? null });
    const theyLiked = db.inbound.some((x) => x.fromId === body.toId);
    const roll = (hashString(`${body.toId}:${db.accountId}`) % 1000) / 1000;
    const matched = theyLiked || roll < mutualRate || (body.level === 'serious' && roll < mutualRate * 1.6);
    let matchId: string | null = null;
    if (matched) {
      const m = createMatch(body.toId);
      matchId = m.matchId;
      notifMock.add('match', { matchId: m.matchId, otherId: body.toId, initiatedByYou: true });
      db.inbound = db.inbound.filter((x) => x.fromId !== body.toId);
      // they say salam a little later
      db.pending.push({ due: now().getTime() + replyDelay * 3, kind: 'reply', matchId: m.matchId });
    }
    return { matched, matchId, usage: usage() };
  }

  // ───────── guardians ─────────

  function requireGuardian(id: string): MockGuardian {
    const g = db.guardians.find((x) => x.id === id);
    if (!g) throw new ApiError(404, 'guardian_not_found', null);
    return g;
  }

  function publicGuardian(g: MockGuardian): Guardian {
    const { code: _code, ...rest } = g;
    return rest;
  }

  function issueCode(g: MockGuardian): GuardianInviteResponse {
    g.code = newInviteCode();
    return { guardian: publicGuardian(g), inviteCode: g.code };
  }

  /** The member's matches in the shape the dashboard builder expects. */
  function myDashboardMatches(): DashboardMatchInput[] {
    const loc = locale();
    return db.matches
      .map((m): DashboardMatchInput | null => {
        const seed = seedById(m.otherId);
        if (!seed) return null;
        return {
          matchId: m.matchId,
          otherId: seed.id,
          otherFirstName: loc === 'ar' ? seed.name[1] : seed.name[0],
          otherAge: seed.match.age,
          otherCity: seed.match.city,
          otherCountry: seed.match.country,
          verifications: seed.verifications,
          stage: derivedStage(m),
          status: m.status,
          compatPct: compatFor(seed)?.displayPct ?? 0,
          memberReady: !!m.awaiting && m.awaiting === derivedStage(m) + 1,
        };
      })
      .filter((x): x is DashboardMatchInput => x !== null);
  }

  // The fictional demo member's introductions: deterministic seeds, generated once per session.
  let demoSeeds: SeedProfile[] | null = null;
  function demoMemberMatches(): DashboardMatchInput[] {
    const loc = locale();
    const stages: JourneyStage[] = [2, 4, 1];
    return demoPeople()
      .slice(0, 3)
      .map((seed, i) => {
        const matchId = `dm_${seed.id}`;
        const stage = db.demoStages[matchId] ?? stages[i] ?? 1;
        return {
          matchId,
          otherId: seed.id,
          otherFirstName: loc === 'ar' ? seed.name[1] : seed.name[0],
          otherAge: seed.match.age,
          otherCity: seed.match.city,
          otherCountry: seed.match.country,
          verifications: seed.verifications,
          stage,
          status: 'active' as const,
          compatPct: 72 + (hashString(seed.id) % 20),
          // Both already tapped "ready" for the family introduction on the second introduction.
          memberReady: i === 1 && stage === 4,
        };
      });
  }

  function demoPeople(): SeedProfile[] {
    demoSeeds ??= generateSeeds({ homeCountry: 'EG', viewerGender: 'female', count: 40, now: new Date('2026-01-01T12:00:00') })
      .filter((s) => s.match.gender === 'male' && s.match.country === 'EG')
      .slice(0, 4);
    return demoSeeds;
  }

  /** The demo member also shared one profile (not a match) with her guardians for an opinion. */
  function demoMemberShared(): DashboardSharedInput[] {
    const loc = locale();
    return demoPeople()
      .slice(3, 4)
      .map((seed) => ({
        subjectId: seed.id,
        firstName: loc === 'ar' ? seed.name[1] : seed.name[0],
        age: seed.match.age,
        city: seed.match.city,
        country: seed.match.country,
        verifications: seed.verifications,
        compatPct: 70 + (hashString(seed.id) % 20),
        sharedAt: new Date(now().getTime() - DAY).toISOString(),
      }));
  }

  /** Profiles this member shared with their own guardians, in the dashboard builder's shape. */
  function mySharedInputs(): DashboardSharedInput[] {
    const loc = locale();
    return db.shares
      .map((sh): DashboardSharedInput | null => {
        const seed = seedById(sh.subjectId);
        if (!seed) return null;
        return {
          subjectId: seed.id,
          firstName: loc === 'ar' ? seed.name[1] : seed.name[0],
          age: seed.match.age,
          city: seed.match.city,
          country: seed.match.country,
          verifications: seed.verifications,
          compatPct: compatFor(seed)?.displayPct ?? 0,
          sharedAt: sh.sharedAt,
        };
      })
      .filter((x): x is DashboardSharedInput => x !== null);
  }

  function demoMemberFirstName(): string {
    return locale() === 'ar' ? DEMO_MEMBER.name[1] : DEMO_MEMBER.name[0];
  }

  function requireLink(memberId: string): MockGuardianLink {
    const link = db.guardianLinks.find((l) => l.memberId === memberId);
    if (!link) throw new ApiError(404, 'guardianship_not_found', null);
    return link;
  }

  function memberMatchesFor(memberId: string): DashboardMatchInput[] {
    return memberId === DEMO_MEMBER_ID ? demoMemberMatches() : [];
  }

  function memberSharedFor(memberId: string): DashboardSharedInput[] {
    return memberId === DEMO_MEMBER_ID ? demoMemberShared() : [];
  }

  /** Example opinions from a guardian who just accepted, on the member's first active matches. */
  function seedOpinionsFrom(g: MockGuardian) {
    if (!g.permissions.see_matches) return;
    ensureSeeds();
    const loc = locale();
    const active = db.matches.filter((m) => m.status === 'active').slice(0, SEED_OPINIONS.length);
    active.forEach((m, i) => {
      const ex = SEED_OPINIONS[i]!;
      db.guardianOpinions = db.guardianOpinions.filter((o) => !(o.guardianId === g.id && o.subjectId === m.otherId));
      db.guardianOpinions.push({
        guardianId: g.id,
        subjectId: m.otherId,
        opinion: ex.opinion,
        note: ex.note[loc],
        updatedAt: new Date(now().getTime() - (i + 1) * 3600000).toISOString(),
      });
      notifMock.add('guardian_opinion', { guardianshipId: g.id, guardianName: g.name, relationship: g.relationship, subjectId: m.otherId, opinion: ex.opinion });
    });
  }

  // ───────── API ─────────

  const api: HalalMeetApi = {
    mode: 'mock',
    privacy: createMockPrivacyApi({
      op,
      db: () => db,
      now,
      locale,
      ensureSeeds: () => ensureSeeds(),
      defaultPreferences: () => db.prefs ?? defaultPrefs(viewerGender(), db.profile ? ageFrom(db.profile.birthDate, now()) : 28),
    }),
    notifications: notifMock.api,
    admin: adminMock.api,
    ...photoMock,

    otpRequest: (body) =>
      op(() => {
        db.phone = body.phone;
      }),

    otpVerify: (body) =>
      op(() => {
        if (!/^\d{6}$/.test(body.code)) throw new ApiError(400, 'invalid_code', null);
        db.phone = body.phone;
        return { token: `mock.${hashString(body.phone).toString(36)}`, accountId: db.accountId, isNew: db.profile === null };
      }),

    me: () =>
      op((): MeResponse => {
        ensureSeeds();
        return {
          accountId: db.accountId,
          locale: locale(),
          profile: myProfile(),
          answersCount: db.answers.length,
          onboardingComplete: db.profile !== null && db.answers.length >= 3,
          entitlements: entitlements(),
          usage: usage(),
          role: adminMock.role(),
        };
      }),

    updateProfile: (body) =>
      op(() => {
        const { locale: loc, ...input } = body;
        if (loc) db.locale = loc;
        if (!input.firstName || !input.gender || !input.country) throw new ApiError(400, 'invalid_profile', null);
        if (ageFrom(input.birthDate, now()) < 18) throw new ApiError(400, 'underage', null);
        db.profile = {
          photoUrl: null,
          verifications: ['phone'],
          ...db.profile,
          ...input,
          id: db.profile?.id ?? 'me',
        };
        ensureSeeds();
        db.feedOrder = null;
      }),

    getAnswers: () => op(() => db.answers),

    putAnswers: (answers) =>
      op(() => {
        const map = new Map(db.answers.map((a) => [a.questionKey, a]));
        for (const a of answers) {
          if (!QUESTIONS_BY_KEY[a.questionKey]) continue;
          map.set(a.questionKey, a);
        }
        db.answers = [...map.values()];
        db.feedOrder = null;
      }),

    putPreferences: (body) =>
      op(() => {
        db.prefs = body;
        db.feedOrder = null;
      }),

    entitlements: () => op(() => entitlements()),

    feed: (cursor) => op(() => feedPage(cursor)),

    topPicks: () =>
      op(() => {
        ensureSeeds();
        const n = tierLimits().topPicksPerDay;
        const picks = eligibleRanked()
          .filter((r) => r.compat.displayPct >= DEFAULT_QUALITY_FLOOR)
          .sort((a, b) => b.compat.overall - a.compat.overall)
          .slice(0, n);
        const refresh = new Date(now());
        refresh.setHours(20, 0, 0, 0);
        if (refresh <= now()) refresh.setDate(refresh.getDate() + 1);
        return { cards: picks.map((r) => cardFor(r.seed, r.compat)), refreshesAt: refresh.toISOString() };
      }),

    profile: (id) =>
      op(() => {
        ensureSeeds();
        const seed = seedById(id);
        if (!seed || db.blocked.includes(id)) throw new ApiError(404, 'profile_not_found', null);
        return cardFor(seed);
      }),

    interest: (body) => op(() => interest(body)),

    pass: (body) =>
      op(() => {
        db.passes[body.toId] = now().toISOString();
        db.inbound = db.inbound.filter((x) => x.fromId !== body.toId);
      }),

    incoming: () =>
      op((): IncomingInterestsResponse => {
        ensureSeeds();
        const list = db.inbound.filter((x) => !actedOn(x.fromId));
        const full = tierLimits().incomingInterests === 'full';
        const cards = list
          .map((x) => {
            const seed = seedById(x.fromId);
            return seed ? { ...cardFor(seed), level: x.level, note: x.note } : null;
          })
          .filter((c): c is NonNullable<typeof c> => c !== null);
        return {
          count: cards.length,
          highCompatCount: cards.filter((c) => c.compatibility.displayPct >= 85).length,
          cards: full ? cards : cards.filter((c) => c.level === 'serious'),
        };
      }),

    matches: () =>
      op(() => {
        db.matches.forEach(evaluateGate);
        return db.matches
          .map(summary)
          .filter((s): s is MatchSummary => s !== null)
          .sort((a, b) => (b.lastMessage?.at ?? '').localeCompare(a.lastMessage?.at ?? ''));
      }),

    messages: (matchId, before) =>
      op(() => {
        requireMatch(matchId);
        const list = (db.messages[matchId] ?? []).filter((m) => !before || m.sentAt < before);
        return list.slice(-50).map(sanitize);
      }),

    sendMessage: (matchId, body) =>
      op(() => {
        const m = requireMatch(matchId);
        if (m.status !== 'active') throw new ApiError(409, 'match_closed', null);
        const me = db.profile!;
        const list = (db.messages[matchId] ??= []);
        if (body.kind === 'topic_card') {
          const q = body.topicKey ? QUESTIONS_BY_KEY[body.topicKey] : undefined;
          if (!q) throw new ApiError(400, 'unknown_topic', null);
          const other = seedById(m.otherId)!;
          const msg: Message = {
            id: nextId('msg'),
            matchId,
            senderId: me.id,
            kind: 'topic_card',
            body: pick(q.text, locale(), other.match.gender),
            topicKey: q.key,
            topicAnswers: { mine: null, theirs: null, revealed: false },
            sentAt: now().toISOString(),
            risk: null,
          };
          list.push(msg);
          db.pending.push({ due: now().getTime() + replyDelay, kind: 'topic_answer', matchId, messageId: msg.id });
          return sanitize(msg);
        }
        const text = (body.body ?? '').trim();
        if (!text) throw new ApiError(400, 'empty_message', null);
        const risk = detectRisk(text);
        const msg: Message = {
          id: nextId('msg'),
          matchId,
          senderId: me.id,
          kind: 'text',
          body: text,
          topicKey: null,
          topicAnswers: null,
          sentAt: now().toISOString(),
          risk: risk ? { warning: risk } : null,
        };
        list.push(msg);
        if (!db.pending.some((e) => e.matchId === matchId && e.kind === 'reply')) {
          db.pending.push({ due: now().getTime() + replyDelay, kind: 'reply', matchId, risky: !!risk });
          const mine = list.filter((x) => x.senderId === me.id && x.kind === 'text').length;
          if (mine % 3 === 2) db.pending.push({ due: now().getTime() + replyDelay * 2, kind: 'topic_card', matchId });
        }
        return msg;
      }),

    answerTopic: (matchId, messageId, body) =>
      op(() => {
        requireMatch(matchId);
        const msg = (db.messages[matchId] ?? []).find((x) => x.id === messageId);
        if (!msg || msg.kind !== 'topic_card' || !msg.topicAnswers) throw new ApiError(404, 'message_not_found', null);
        const theirs = db.topicTheirs[messageId] ?? null;
        msg.topicAnswers = { mine: body.value, theirs, revealed: theirs !== null };
        return sanitize(msg);
      }),

    stageReady: (matchId, body) =>
      op(() => {
        const m = requireMatch(matchId);
        if (m.status !== 'active' || body.stage <= derivedStage(m)) return;
        // The other person is simulated as ready straight away. Stages 5 and 6 also wait for one of your
        // approving guardians (approve_stages), exactly like the server: the stage holds until then.
        if ((body.stage === 5 || body.stage === 6) && needsMyApproval(m, body.stage)) {
          m.awaiting = body.stage;
          return;
        }
        advanceTo(m, body.stage);
      }),

    closeMatch: (matchId, body) =>
      op(() => {
        const m = requireMatch(matchId);
        const list = (db.messages[matchId] ??= []);
        if (body.message) {
          list.push({ id: nextId('msg'), matchId, senderId: db.profile!.id, kind: 'text', body: body.message, topicKey: null, topicAnswers: null, sentAt: now().toISOString(), risk: null });
        }
        list.push(systemMessage(matchId, byAuthor(SYSTEM_TEXT.closed, locale(), viewerGender())));
        m.status = 'closed';
        db.pending = db.pending.filter((e) => e.matchId !== matchId);
      }),

    passport: () =>
      op(() => ({
        destinations: activeDestinations(),
        entitlements: entitlements().passport,
        suggestions: passportSuggestions(),
      })),

    addPassport: (body) =>
      op(() => {
        if (!identityVerified()) throw new ApiError(403, 'identity_required', { error: 'identity_required' });
        const ent = entitlements().passport;
        const active = activeDestinations();
        if (body.isWorldwide && !tierLimits().passport.worldwide) throw new LimitReachedError(usage(), 'passport');
        if (ent.capacity === 0) throw new LimitReachedError(usage(), 'passport', { error: 'limit_reached' });
        if (active.length >= ent.capacity) {
          if (ent.capacity === 1) {
            // single-slot plans switch destination
            active.forEach((d) => (d.status = 'cancelled'));
          } else {
            throw new ApiError(409, 'capacity_reached', null);
          }
        }
        const t = now();
        const visitFrom = body.visitFrom ? new Date(`${body.visitFrom}T00:00:00`) : null;
        const visibleFrom = visitFrom ? new Date(Math.max(t.getTime(), visitFrom.getTime() - 14 * DAY)) : t;
        let activeUntil: string | null = body.visitTo ? new Date(`${body.visitTo}T23:59:59`).toISOString() : null;
        if (ent.source === 'pass' && db.passExpiresAt && !body.visitTo) activeUntil = db.passExpiresAt;
        db.destinations.push({
          id: nextId('pp'),
          country: body.country,
          city: body.city ?? null,
          purpose: body.purpose,
          visitFrom: body.visitFrom ?? null,
          visitTo: body.visitTo ?? null,
          visibleFrom: visibleFrom.toISOString(),
          activeUntil,
          status: visibleFrom > t ? 'scheduled' : 'active',
          isWorldwide: !!body.isWorldwide,
        });
        db.feedOrder = null;
      }),

    removePassport: (id) =>
      op(() => {
        const d = db.destinations.find((x) => x.id === id);
        if (d) d.status = 'cancelled';
        db.destinations = db.destinations.filter((x) => x.status !== 'cancelled');
        db.feedOrder = null;
      }),

    myBilling: () => op(() => mockBilling()),
    billingSync: () =>
      op(() => {
        // Same answer as a server without REVENUECAT_API_KEY.
        throw new ApiError(501, 'store_sync_unavailable', null);
      }),
    claimFreePass: () =>
      op(() => {
        if (!entitlements().passport.freePassAvailable) throw new ApiError(403, 'free_pass_unavailable', null);
        db.freePassUsedAt = now().toISOString();
        db.passExpiresAt = new Date(now().getTime() + 7 * DAY).toISOString();
        db.feedOrder = null;
        return { ok: true as const, billing: mockBilling(), entitlements: entitlements() };
      }),

    devGrant: (body) =>
      op(() => {
        switch (body.sku) {
          case 'free':
            db.tier = 'free';
            db.passportAddon = false;
            db.passExpiresAt = null;
            break;
          case 'plus_monthly':
            db.tier = 'plus';
            break;
          case 'gold_monthly':
            db.tier = 'gold';
            break;
          case 'passport_addon_monthly':
            db.passportAddon = true;
            break;
          case 'passport_pass_7d':
            if (entitlements().passport.freePassAvailable) db.freePassUsedAt = now().toISOString();
            db.passExpiresAt = new Date(now().getTime() + 7 * DAY).toISOString();
            break;
        }
        db.feedOrder = null;
      }),

    report: (body) =>
      op(() => {
        db.reports.push(body);
      }),

    block: (body) =>
      op(() => {
        if (!db.blocked.includes(body.subjectId)) db.blocked.push(body.subjectId);
        db.matches.filter((m) => m.otherId === body.subjectId).forEach((m) => (m.status = 'closed'));
        db.inbound = db.inbound.filter((x) => x.fromId !== body.subjectId);
        db.feedOrder = null;
      }),

    countries: () =>
      op(() =>
        COUNTRIES.map((c) => ({
          code: c.code,
          status: (OPEN_COUNTRIES.has(c.code) ? 'open' : 'growing') as CountryStatus,
          verifiedProfiles: db.seeds.filter((s) => s.match.country === c.code && s.match.identityVerified).length,
        })),
      ),

    // ───────── guardians: member side ─────────

    guardians: () => op(() => db.guardians.map(publicGuardian)),

    inviteGuardian: (body) =>
      op(() => {
        const name = body.name.trim();
        if (!name) throw new ApiError(400, 'invalid_name', null);
        const g: MockGuardian = {
          id: nextId('g'),
          name: name.slice(0, 40),
          relationship: body.relationship,
          permissions: { ...body.permissions },
          status: 'invited',
          accepted: false,
          invitedAt: now().toISOString(),
          acceptedAt: null,
          code: null,
        };
        db.guardians.push(g);
        return issueCode(g);
      }),

    updateGuardian: (id, body) =>
      op(() => {
        const g = requireGuardian(id);
        if (body.permissions) g.permissions = { ...body.permissions };
        if (body.paused === true) g.status = 'paused';
        if (body.paused === false) g.status = g.accepted ? 'active' : 'invited';
        return publicGuardian(g);
      }),

    reissueGuardianInvite: (id) =>
      op(() => {
        const g = requireGuardian(id);
        if (g.accepted) throw new ApiError(409, 'already_accepted', null);
        return issueCode(g); // the previous code stops working
      }),

    removeGuardian: (id) =>
      op(() => {
        requireGuardian(id);
        db.guardians = db.guardians.filter((g) => g.id !== id);
        db.guardianOpinions = db.guardianOpinions.filter((o) => o.guardianId !== id);
        db.stageApprovals = db.stageApprovals.filter((a) => a.guardianId !== id);
      }),

    guardianOpinions: () =>
      op((): GuardianOpinion[] =>
        db.guardianOpinions
          .map((o): GuardianOpinion | null => {
            const g = db.guardians.find((x) => x.id === o.guardianId);
            return g
              ? {
                  guardianId: g.id,
                  guardianName: g.name,
                  relationship: g.relationship,
                  subjectId: o.subjectId,
                  subjectFirstName: (() => {
                    const seed = seedById(o.subjectId);
                    return seed ? (locale() === 'ar' ? seed.name[1] : seed.name[0]) : '';
                  })(),
                  opinion: o.opinion,
                  note: o.note,
                  updatedAt: o.updatedAt,
                }
              : null;
          })
          .filter((o): o is GuardianOpinion => o !== null)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
      ),

    shareWithGuardians: (subjectId) =>
      op(() => {
        const p = db.profile;
        if (!p) throw new ApiError(409, 'profile_required', null);
        if (subjectId === p.id) throw new ApiError(400, 'cannot_share_self', { error: 'cannot_share_self' });
        ensureSeeds();
        if (!seedById(subjectId)) throw new ApiError(404, 'profile_not_found', null);
        db.shares = [{ subjectId, sharedAt: now().toISOString() }, ...db.shares.filter((x) => x.subjectId !== subjectId)];
      }),

    unshareWithGuardians: (subjectId) =>
      op(() => {
        db.shares = db.shares.filter((x) => x.subjectId !== subjectId);
      }),

    // ───────── guardians: guardian side ─────────

    guardianInvitePreview: (raw) =>
      op(() => {
        const code = normalizeCode(raw);
        if (code === DEMO_GUARDIAN_CODE) {
          if (db.guardianLinks.some((l) => l.memberId === DEMO_MEMBER_ID)) throw new ApiError(404, 'invite_not_found', null);
          return {
            memberFirstName: demoMemberFirstName(),
            memberGender: DEMO_MEMBER.gender,
            relationship: DEMO_MEMBER.relationship,
            permissions: defaultGuardianPermissions(DEMO_MEMBER.halalMode),
          };
        }
        const g = db.guardians.find((x) => x.code === code);
        if (!g || !db.profile) throw new ApiError(404, 'invite_not_found', null);
        return { memberFirstName: db.profile.firstName, memberGender: db.profile.gender, relationship: g.relationship, permissions: g.permissions };
      }),

    acceptGuardianInvite: (raw) =>
      op((): GuardianLink => {
        const code = normalizeCode(raw);
        if (code === DEMO_GUARDIAN_CODE) {
          if (db.guardianLinks.some((l) => l.memberId === DEMO_MEMBER_ID)) throw new ApiError(409, 'already_accepted', null);
          const link: MockGuardianLink = {
            guardianshipId: nextId('gs'),
            memberId: DEMO_MEMBER_ID,
            memberFirstName: demoMemberFirstName(),
            relationship: DEMO_MEMBER.relationship,
            status: 'active',
            permissions: defaultGuardianPermissions(DEMO_MEMBER.halalMode),
            acceptedAt: now().toISOString(),
          };
          db.guardianLinks.push(link);
          const { acceptedAt: _a, ...out } = link;
          return out;
        }
        if (db.usedGuardianCodes.includes(code)) throw new ApiError(409, 'already_accepted', null);
        const g = db.guardians.find((x) => x.code === code);
        if (!g) throw new ApiError(404, 'invite_not_found', null);
        // Every other invitation in this single-device demo was created by this same account.
        throw new ApiError(400, 'cannot_guard_self', { error: 'cannot_guard_self' });
      }),

    guardianLinks: () =>
      op(() =>
        db.guardianLinks.map(({ acceptedAt: _a, ...l }) => ({
          ...l,
          memberFirstName: l.memberId === DEMO_MEMBER_ID ? demoMemberFirstName() : l.memberFirstName,
        })),
      ),

    guardianDashboard: (memberId) =>
      op((): GuardianDashboard => {
        const link = requireLink(memberId);
        if (link.status === 'paused') throw new ApiError(403, 'guardian_paused', { error: 'guardian_paused' });
        const mine = db.myGuardianOpinions[memberId] ?? {};
        return buildGuardianDashboard({
          member: { id: memberId, firstName: memberId === DEMO_MEMBER_ID ? demoMemberFirstName() : link.memberFirstName, halalMode: DEMO_MEMBER.halalMode },
          relationship: link.relationship,
          permissions: link.permissions,
          matches: memberMatchesFor(memberId),
          opinions: Object.fromEntries(Object.entries(mine).map(([k, v]) => [k, { value: v.value, note: v.note }])),
          approvals: db.myGuardianApprovals[memberId] ?? {},
          shared: memberSharedFor(memberId),
          openReports: 0,
        });
      }),

    putGuardianOpinion: (memberId, subjectId, body) =>
      op(() => {
        const link = requireLink(memberId);
        if (link.status === 'paused') throw new ApiError(403, 'guardian_paused', null);
        if (!link.permissions.see_matches) throw new ApiError(403, 'forbidden', null);
        // Opinions work on active introductions and on profiles the member shared.
        const subject =
          memberMatchesFor(memberId).some((m) => m.otherId === subjectId && m.status === 'active') ||
          memberSharedFor(memberId).some((p) => p.subjectId === subjectId);
        if (!subject) throw new ApiError(404, 'subject_not_found', null);
        const note = body.note?.trim() ? body.note.trim().slice(0, 500) : null;
        (db.myGuardianOpinions[memberId] ??= {})[subjectId] = { value: body.opinion, note, updatedAt: now().toISOString() };
      }),

    putGuardianApproval: (memberId, matchId, body) =>
      op(() => {
        const link = requireLink(memberId);
        if (link.status === 'paused') throw new ApiError(403, 'guardian_paused', { error: 'guardian_paused' });
        if (!link.permissions.approve_stages) throw new ApiError(403, 'forbidden', null);
        const match = memberMatchesFor(memberId).find((m) => m.matchId === matchId && m.status === 'active');
        if (!match) throw new ApiError(404, 'match_not_found', null);
        if (match.stage !== body.stage - 1) throw new ApiError(409, 'stage_mismatch', { error: 'stage_mismatch' });
        (db.myGuardianApprovals[memberId] ??= {})[matchId] = { stage: body.stage, decision: body.decision };
        // Approving re-evaluates the stage straight away (the demo member and the other person are both ready).
        if (body.decision === 'approve' && match.memberReady && memberId === DEMO_MEMBER_ID) db.demoStages[matchId] = body.stage;
      }),

    leaveGuardianship: (memberId) =>
      op(() => {
        requireLink(memberId);
        db.guardianLinks = db.guardianLinks.filter((l) => l.memberId !== memberId);
        delete db.myGuardianOpinions[memberId];
        delete db.myGuardianApprovals[memberId];
        if (memberId === DEMO_MEMBER_ID) db.demoStages = {};
      }),

    dev: {
      demoGuardianInviteCode: DEMO_GUARDIAN_CODE,

      simulateGuardianAccept: (guardianId) =>
        op(() => {
          const g = requireGuardian(guardianId);
          if (g.accepted) throw new ApiError(409, 'already_accepted', null);
          if (g.code) db.usedGuardianCodes.push(g.code);
          g.code = null;
          g.accepted = true;
          g.acceptedAt = now().toISOString();
          if (g.status === 'invited') g.status = 'active';
          notifMock.add('guardian_accepted', { guardianshipId: g.id, guardianName: g.name, relationship: g.relationship });
          seedOpinionsFrom(g);
          return publicGuardian(g);
        }),

      simulateGuardianApproval: (matchId) =>
        op(() => {
          const m = requireMatch(matchId);
          if (m.status !== 'active') throw new ApiError(409, 'match_closed', null);
          const cur = derivedStage(m);
          const stage: 5 | 6 | null = m.awaiting ?? (cur === 4 ? 5 : cur === 5 ? 6 : null);
          if (!stage) throw new ApiError(409, 'stage_mismatch', { error: 'stage_mismatch' });
          const g = approvers()[0];
          if (!g) throw new ApiError(409, 'no_approving_guardian', { error: 'no_approving_guardian' });
          db.stageApprovals = db.stageApprovals.filter((a) => !(a.guardianId === g.id && a.matchId === matchId && a.stage === stage));
          db.stageApprovals.push({ guardianId: g.id, matchId, stage, decision: 'approve', at: now().toISOString() });
          evaluateGate(m);
          notifMock.add('guardian_stage_decision', { guardianshipId: g.id, guardianName: g.name, relationship: g.relationship, matchId, stage, decision: 'approve' });
        }),

      guardianDashboardFor: (guardianId) =>
        op((): GuardianDashboard => {
          const g = requireGuardian(guardianId);
          if (!g.accepted) throw new ApiError(404, 'guardianship_not_found', null);
          if (g.status === 'paused') throw new ApiError(403, 'guardian_paused', { error: 'guardian_paused' });
          ensureSeeds();
          const p = db.profile;
          if (!p) throw new ApiError(409, 'profile_required', null);
          const opinions = Object.fromEntries(
            db.guardianOpinions.filter((o) => o.guardianId === g.id).map((o) => [o.subjectId, { value: o.opinion, note: o.note }]),
          );
          const approvals: DashboardApprovals = {};
          for (const a of db.stageApprovals) if (a.guardianId === g.id) approvals[a.matchId] = { stage: a.stage, decision: a.decision };
          return buildGuardianDashboard({
            member: { id: p.id, firstName: p.firstName, halalMode: p.halalMode },
            relationship: g.relationship,
            permissions: g.permissions,
            matches: myDashboardMatches(),
            opinions,
            approvals,
            shared: mySharedInputs(),
            openReports: db.reports.length,
          });
        }),

      verifyIdentity: () =>
        op(() => {
          if (db.profile && !db.profile.verifications.includes('identity')) db.profile.verifications.push('identity');
          db.feedOrder = null;
        }),
      reset: async () => {
        await ready;
        await adminMock.reset();
        db = freshDb();
        if (storage) await storage.removeItem(STORAGE_KEY);
      },
    },
  };

  return api;
}
