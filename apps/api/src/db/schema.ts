/**
 * Drizzle pg-core schema (works for both node-postgres and PGlite).
 * Condensed from spec/03-data-model.md: questions live in @halal-meet/core, so answers are keyed by question key;
 * conversations are folded into `matches` + `messages` (one conversation per match for the MVP).
 */
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type { Dimension, Importance } from '@halal-meet/core';

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => ts('created_at').notNull().defaultNow();

// ───────── Identity ─────────
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey(),
  phoneE164: text('phone_e164').notNull().unique(),
  locale: text('locale').notNull().default('ar'),
  status: text('status').notNull().default('active'), // active/paused/hidden/engaged/suspended/banned/deleted
  role: text('role').notNull().default('member'),
  lastActiveAt: ts('last_active_at'),
  lastFeedVisitAt: ts('last_feed_visit_at'),
  createdAt: createdAt(),
});

export const profiles = pgTable(
  'profiles',
  {
    accountId: uuid('account_id')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    firstName: text('first_name').notNull(),
    gender: text('gender').notNull(), // male/female
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    nationality: text('nationality').array().notNull(),
    country: text('country').notNull(),
    city: text('city').notNull(),
    languages: text('languages').array().notNull(),
    heightCm: smallint('height_cm'),
    maritalStatus: text('marital_status').notNull(),
    hasChildren: boolean('has_children').notNull().default(false),
    educationLevel: text('education_level'),
    profession: text('profession'),
    intention: text('intention').notNull(),
    halalMode: text('halal_mode').notNull(),
    acceptedModes: text('accepted_modes').array().notNull(),
    about: text('about_me'),
    photoUrl: text('photo_url'),
    photoVisibility: text('photo_visibility').notNull().default('matches'),
    openToRelocate: boolean('open_to_relocate').notNull().default(false),
    relocateCountries: text('relocate_countries').array().notNull().default([]),
    intlVisibility: text('intl_visibility').notNull().default('on'),
    profileStrength: smallint('profile_strength').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [index('profiles_gender_country_idx').on(t.gender, t.country)],
);

export const answers = pgTable(
  'answers',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    questionKey: text('question_key').notNull(),
    selfValue: jsonb('self_value').$type<string | string[] | null>(),
    partnerAccept: jsonb('partner_accept').$type<string[] | null>(),
    importance: text('importance').$type<Importance>().notNull().default('flexible'),
    answeredAt: ts('answered_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.questionKey] })],
);

export const matchPreferences = pgTable('match_preferences', {
  accountId: uuid('account_id')
    .primaryKey()
    .references(() => accounts.id, { onDelete: 'cascade' }),
  ageMin: smallint('age_min').notNull(),
  ageMax: smallint('age_max').notNull(),
  maritalStatuses: text('marital_statuses').array(),
  acceptChildren: boolean('accept_children').notNull().default(true),
  verifiedOnly: boolean('verified_only').notNull().default(false),
  languages: text('languages').array(),
  dimensionImportance: jsonb('dimension_importance').$type<Partial<Record<Dimension, Importance>>>().notNull().default({}),
});

export const verifications = pgTable(
  'verifications',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // phone/identity/profession/education/marital/family
    status: text('status').notNull(), // pending/approved/rejected/expired
    vendor: text('vendor'),
    decidedAt: ts('decided_at'),
    createdAt: createdAt(),
  },
  (t) => [index('verifications_account_idx').on(t.accountId)],
);

// ───────── Matching ─────────
export const passportDestinations = pgTable(
  'passport_destinations',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    country: text('country').notNull(),
    city: text('city'),
    isWorldwide: boolean('is_worldwide').notNull().default(false),
    purpose: text('purpose').notNull(),
    visitFrom: date('visit_from', { mode: 'string' }),
    visitTo: date('visit_to', { mode: 'string' }),
    visibleFrom: ts('visible_from').notNull(),
    activeUntil: ts('active_until'),
    status: text('status').notNull(), // scheduled/active/expired/cancelled (time-derived states are recomputed on read)
    source: text('source').notNull(), // pass/addon/plan/plus_quarterly
    createdAt: createdAt(),
  },
  (t) => [
    index('passport_country_idx').on(t.country, t.status, t.visibleFrom),
    index('passport_account_idx').on(t.accountId),
  ],
);

export const feedImpressions = pgTable(
  'feed_impressions',
  {
    id: uuid('id').primaryKey(),
    viewerId: uuid('viewer_id').notNull(),
    candidateId: uuid('candidate_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    position: integer('position').notNull(),
    slot: text('slot').notNull(),
    rankScore: real('rank_score'),
    displayPct: smallint('display_pct'),
    shownAt: ts('shown_at').notNull().defaultNow(),
  },
  (t) => [
    index('impressions_candidate_idx').on(t.candidateId, t.shownAt),
    index('impressions_viewer_idx').on(t.viewerId, t.shownAt),
  ],
);

export const topPicks = pgTable(
  'top_picks',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    pickDate: date('pick_date', { mode: 'string' }).notNull(),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    position: smallint('position').notNull(),
    source: text('source').notNull().default('algo'),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.pickDate, t.candidateId] })],
);

export const interests = pgTable(
  'interests',
  {
    id: uuid('id').primaryKey(),
    fromId: uuid('from_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    toId: uuid('to_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    level: text('level').notNull(), // interest/serious
    note: text('note'),
    abymAnswers: jsonb('abym_answers').$type<Record<string, string> | null>(),
    status: text('status').notNull().default('pending'), // pending/matched/passed/expired
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('interests_pair_uq').on(t.fromId, t.toId), index('interests_to_idx').on(t.toId, t.status)],
);

export const passes = pgTable(
  'passes',
  {
    fromId: uuid('from_id').notNull(),
    toId: uuid('to_id').notNull(),
    reason: text('reason'),
    undone: boolean('undone').notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId] })],
);

export const matches = pgTable(
  'matches',
  {
    id: uuid('id').primaryKey(),
    aId: uuid('a_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    bId: uuid('b_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    stage: smallint('stage').notNull().default(1),
    status: text('journey_status').notNull().default('active'), // active/closed
    closedBy: uuid('closed_by'),
    closeReason: text('close_reason'),
    firstMessageDue: ts('first_message_due'),
    createdAt: createdAt(),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('matches_pair_uq').on(t.aId, t.bId), index('matches_b_idx').on(t.bId)],
);

export const stageReadiness = pgTable(
  'stage_readiness',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    stage: smallint('stage').notNull(),
    readyAt: ts('ready_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.accountId, t.stage] })],
);

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').primaryKey(),
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    senderId: uuid('sender_id'), // null = system
    kind: text('kind').notNull(), // text/topic_card/system
    body: text('body').notNull(),
    topicKey: text('topic_key'),
    risk: text('risk'), // money/off_platform/explicit/aggression
    hidden: boolean('hidden').notNull().default(false),
    sentAt: ts('sent_at').notNull().defaultNow(),
  },
  (t) => [index('messages_match_idx').on(t.matchId, t.sentAt)],
);

export const topicAnswers = pgTable(
  'topic_answers',
  {
    messageId: uuid('message_id')
      .notNull()
      .references(() => messages.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').notNull(),
    value: text('value').notNull(),
    answeredAt: ts('answered_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.accountId] })],
);

export const topicCoverage = pgTable(
  'topic_coverage',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    topicKey: text('topic_key').notNull(),
    differs: boolean('differs').notNull().default(false),
    coveredAt: ts('covered_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.topicKey] })],
);

// ───────── Safety ─────────
export const reports = pgTable('reports', {
  id: uuid('id').primaryKey(),
  reporterId: uuid('reporter_id').notNull(),
  subjectId: uuid('subject_id').notNull(),
  category: text('category').notNull(),
  details: text('details'),
  evidenceMessageIds: uuid('evidence_message_ids').array(),
  status: text('status').notNull().default('open'),
  createdAt: createdAt(),
});

export const blocks = pgTable(
  'blocks',
  {
    blockerId: uuid('blocker_id').notNull(),
    blockedId: uuid('blocked_id').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.blockerId, t.blockedId] })],
);

// ───────── Guardians & family (spec 03, 01 §43–46) ─────────
export const guardianships = pgTable(
  'guardianships',
  {
    id: uuid('id').primaryKey(),
    memberId: uuid('member_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    /** Null until someone accepts the invitation. */
    guardianId: uuid('guardian_id').references(() => accounts.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    relationship: text('relationship').notNull(), // father/mother/brother/sister/uncle/aunt/other
    status: text('status').notNull().default('invited'), // invited/active/paused (removed rows are deleted)
    permissions: jsonb('permissions').$type<Record<string, boolean>>().notNull(),
    /** sha256 of the current invite code; cleared once accepted. */
    inviteTokenHash: text('invite_token_hash'),
    invitedAt: ts('invited_at').notNull().defaultNow(),
    acceptedAt: ts('accepted_at'),
    verifiedFamily: boolean('verified_family').notNull().default(false),
  },
  (t) => [
    index('guardianships_member_idx').on(t.memberId),
    index('guardianships_guardian_idx').on(t.guardianId),
    uniqueIndex('guardianships_token_uq').on(t.inviteTokenHash),
  ],
);

export const guardianOpinions = pgTable(
  'guardian_opinions',
  {
    guardianshipId: uuid('guardianship_id')
      .notNull()
      .references(() => guardianships.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    opinion: text('opinion').notNull(), // support/discuss/concern
    note: text('note'),
    updatedAt: ts('updated_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.guardianshipId, t.subjectId] })],
);

/** A guardian's decision on a match moving to stage 5 or 6 (spec 01 §44 "approve stage progression"). */
export const stageApprovals = pgTable(
  'stage_approvals',
  {
    matchId: uuid('match_id')
      .notNull()
      .references(() => matches.id, { onDelete: 'cascade' }),
    guardianshipId: uuid('guardianship_id')
      .notNull()
      .references(() => guardianships.id, { onDelete: 'cascade' }),
    stage: smallint('stage').notNull(),
    decision: text('decision').notNull(), // approve/discuss
    decidedAt: ts('decided_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.matchId, t.guardianshipId, t.stage] })],
);

/** Profiles a member shared with their guardians for an opinion. */
export const guardianShares = pgTable(
  'guardian_shares',
  {
    memberId: uuid('member_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    subjectId: uuid('subject_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sharedAt: ts('shared_at').notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.memberId, t.subjectId] })],
);

// ───────── Monetization ─────────
export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    tier: text('tier').notNull(), // plus/gold/elite/passport_addon
    store: text('store').notNull(), // apple/google/stripe/dev
    storeRef: text('store_ref'),
    status: text('status').notNull(), // active/cancelled/expired
    period: text('period'),
    currentPeriodEnd: ts('current_period_end').notNull(),
    autoRenew: boolean('auto_renew').notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [index('subscriptions_account_idx').on(t.accountId)],
);

export const purchases = pgTable(
  'purchases',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull(),
    store: text('store').notNull(), // apple/google/dev/plus_quarterly
    storeRef: text('store_ref'),
    amountMinor: integer('amount_minor'),
    currency: text('currency'),
    status: text('status').notNull(), // fulfilled/revoked
    fulfilledAt: ts('fulfilled_at'),
    expiresAt: ts('expires_at'),
    createdAt: createdAt(),
  },
  (t) => [index('purchases_account_idx').on(t.accountId)],
);

/** Append-only log of rate-limited actions (daily interests, serious-interest window). */
export const usageEvents = pgTable(
  'usage_events',
  {
    id: uuid('id').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // interest/serious
    at: ts('at').notNull().defaultNow(),
  },
  (t) => [index('usage_events_idx').on(t.accountId, t.kind, t.at)],
);

/** Manual country status overrides (seeded for the demo; see COUNTRY_STATUS_OVERRIDES env too). */
export const countryStatusOverrides = pgTable('country_status_overrides', {
  code: text('code').primaryKey(),
  status: text('status').notNull(), // growing/open
});
