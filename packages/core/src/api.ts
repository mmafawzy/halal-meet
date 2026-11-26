/**
 * HTTP API contract shared by apps/api (server) and apps/mobile (client).
 * All requests except /auth/* require `Authorization: Bearer <token>`.
 * Reasons and discuss flags are returned as codes; clients render them with `renderReason` / `renderDiscuss`.
 */
import type { CountryStatus, RegionId } from './regions';
import type { PlanLimits, Sku } from './plans';
import type { GuardianPresence, PendingGuardianApproval } from './guardians';
import type {
  Answer,
  Dimension,
  DimensionScore,
  DiscussFlag,
  Gender,
  HalalMode,
  Importance,
  IntlVisibility,
  Intention,
  Locale,
  MaritalStatus,
  PassportDestination,
  PassportPurpose,
  PhotoVisibility,
  PlanTier,
  ReasonCode,
  VerificationKind,
} from './types';

// ───────── Auth ─────────
export interface OtpRequestBody { phone: string; /** Default sms. */ channel?: 'sms' | 'whatsapp' }
export interface OtpVerifyBody { phone: string; code: string }
export interface OtpVerifyResponse { token: string; accountId: string; isNew: boolean }

// ───────── Me / profile ─────────
export interface ProfileInput {
  firstName: string;
  gender: Gender;
  birthDate: string; // YYYY-MM-DD
  nationality: string[];
  country: string;
  city: string;
  languages: string[];
  heightCm?: number | null;
  maritalStatus: MaritalStatus;
  hasChildren: boolean;
  educationLevel?: string | null;
  profession?: string | null;
  intention: Intention;
  halalMode: HalalMode;
  acceptedModes: HalalMode[];
  about?: string | null;
  photoVisibility: PhotoVisibility;
  openToRelocate: boolean;
  relocateCountries: string[];
  intlVisibility: IntlVisibility;
}

export interface MyProfile extends ProfileInput {
  id: string;
  age: number;
  photoUrl: string | null;
  verifications: VerificationKind[];
  profileStrength: number; // 0..100
}

export interface MatchPreferencesInput {
  ageMin: number;
  ageMax: number;
  maritalStatuses: MaritalStatus[] | null;
  acceptChildren: boolean;
  verifiedOnly: boolean;
  languages: string[] | null;
  dimensionImportance: Partial<Record<Dimension, Importance>>;
}

export interface Usage {
  interestsToday: number;
  interestsLimit: number | null;
  seriousUsed: number;
  seriousLimit: number;
  topPicksPerDay: number;
  /** ISO timestamp of the next daily reset (local midnight for the user). */
  resetsAt: string;
}

export interface Entitlements {
  tier: PlanTier;
  limits: PlanLimits;
  passport: {
    capacity: number; // destinations allowed at once (0 = none)
    source: 'none' | 'pass' | 'addon' | 'plan';
    passExpiresAt: string | null;
    freePassAvailable: boolean; // Plus quarterly pass
  };
}

export interface MeResponse {
  accountId: string;
  locale: Locale;
  profile: MyProfile | null;
  answersCount: number;
  onboardingComplete: boolean;
  entitlements: Entitlements;
  usage: Usage;
  /** Account role (moderation console is shown to 'moderator' / 'admin'). Optional for older servers. */
  role?: 'member' | 'guardian' | 'matchmaker' | 'moderator' | 'admin';
}

export interface AnswersBody { answers: Answer[] }

// ───────── Discover ─────────
export type FeedSlot = 'core' | 'pinned_serious' | 'inbound' | 'new_member' | 'explore' | 'broader' | 'top_pick';

export interface CompatibilityView {
  displayPct: number;
  /** Gated by plan: free = top 3 reasons + 1 discuss flag + no dims beyond overall. */
  dims: Partial<Record<Dimension, DimensionScore>>;
  reasons: ReasonCode[];
  discuss: DiscussFlag[];
  /** True when the plan hides part of the report (client shows an unlock CTA). */
  truncated: boolean;
}

export interface PassportBadge {
  homeCountry: string;
  homeCity: string;
  destinationCountry: string;
  purpose: PassportPurpose;
  visitFrom: string | null;
  visitTo: string | null;
}

export interface ProfileCard {
  id: string;
  firstName: string;
  gender: Gender;
  age: number;
  country: string;
  city: string;
  photoUrl: string | null;
  photoState: 'visible' | 'blurred' | 'locked';
  verifications: VerificationKind[];
  halalMode: HalalMode;
  intention: Intention;
  maritalStatus: MaritalStatus;
  hasChildren: boolean;
  profession: string | null;
  educationLevel: string | null;
  about: string | null;
  languages: string[];
  passport: PassportBadge | null;
  compatibility: CompatibilityView;
  /** Up to 5 key facts for "Ask Before You Match": question keys + the person's own answer value. */
  keyFacts: Array<{ questionKey: string; value: string }>;
  isNew: boolean;
  sentYouSeriousInterest: boolean;
}

export type FeedItem =
  | { type: 'profile'; slot: FeedSlot; card: ProfileCard }
  | { type: 'divider'; kind: 'broader_matches' }
  | { type: 'inline'; kind: 'daily_question'; questionKey: string }
  | { type: 'inline'; kind: 'reveal'; dimension: Dimension; questionsNeeded: number }
  | { type: 'inline'; kind: 'upsell'; sku: Sku; reason: 'interests' | 'top_picks' | 'passport' }
  | { type: 'inline'; kind: 'mindful_browsing' };

export interface FeedScope {
  kind: 'country' | 'region' | 'passport';
  /** Country codes currently included. */
  countries: string[];
  region: RegionId | null;
  countryStatus: CountryStatus;
}

export interface FeedPage {
  items: FeedItem[];
  nextCursor: string | null;
  endOfPool: boolean;
  newSinceLastVisit: number;
  scope: FeedScope;
  /** Live counts for the end-of-pool Passport suggestion. */
  passportSuggestions: Array<{ country: string; compatibleCount: number }>;
}

export interface TopPicksResponse { cards: ProfileCard[]; refreshesAt: string }

// ───────── Interests & matches ─────────
export interface InterestBody {
  toId: string;
  level: 'interest' | 'serious';
  note?: string;
  /** Ask Before You Match answers: questionKey → response. */
  abym?: Record<string, 'compatible' | 'not_compatible' | 'discuss'>;
}
export interface InterestResponse { matched: boolean; matchId: string | null; usage: Usage }
export interface PassBody { toId: string; reason?: 'religion' | 'location' | 'age' | 'life_plans' | 'not_a_fit' | 'prefer_not' }

export interface IncomingInterestsResponse {
  count: number;
  highCompatCount: number; // >= 85%
  /** Empty for free users (they see counts only); serious interests are always included. */
  cards: Array<ProfileCard & { level: 'interest' | 'serious'; note: string | null }>;
}

export type JourneyStage = 1 | 2 | 3 | 4 | 5 | 6;

export interface MatchSummary {
  matchId: string;
  other: ProfileCard;
  stage: JourneyStage;
  topicsCovered: number;
  topicsTotal: number;
  lastMessage: { body: string; at: string; fromMe: boolean } | null;
  yourMove: boolean;
  firstMessageDue: string | null;
  status: 'active' | 'closed';
  /** Active guardians on each side (relationship and role only). Always visible to both people. */
  guardians: { mine: GuardianPresence[]; theirs: GuardianPresence[] };
  /** Set when both people are ready for stage 5/6 but a guardian approval is still missing. */
  pendingGuardianApproval: PendingGuardianApproval | null;
}

export type MessageKind = 'text' | 'topic_card' | 'system';

export interface Message {
  id: string;
  matchId: string;
  senderId: string | null; // null for system messages
  kind: MessageKind;
  body: string;
  topicKey: string | null;
  /** For topic cards: both answers are revealed only after both have answered. */
  topicAnswers: { mine: string | null; theirs: string | null; revealed: boolean } | null;
  sentAt: string;
  risk: { warning: 'money' | 'off_platform' | 'explicit' | 'aggression' } | null;
}

export interface SendMessageBody { kind: 'text' | 'topic_card'; body?: string; topicKey?: string }
export interface AnswerTopicBody { value: string }
export interface CloseMatchBody { template: 'respectful_default' | 'custom'; message?: string; reason?: string }
export interface StageReadyBody { stage: JourneyStage }

// ───────── Passport ─────────
export interface PassportDestinationInput {
  country: string;
  city?: string | null;
  isWorldwide?: boolean;
  purpose: PassportPurpose;
  visitFrom?: string | null;
  visitTo?: string | null;
}

export interface PassportResponse {
  destinations: PassportDestination[];
  entitlements: Entitlements['passport'];
  suggestions: Array<{ country: string; compatibleCount: number }>;
}

// ───────── Billing (store receipts are validated server-side; dev grant exists in non-prod) ─────────
export interface DevGrantBody { sku: Sku | 'free' }

// ───────── Safety ─────────
export interface ReportBody {
  subjectId: string;
  category: 'scam' | 'harassment' | 'fake_profile' | 'inappropriate' | 'underage' | 'other';
  details?: string;
  messageIds?: string[];
}
export interface BlockBody { subjectId: string }

// ───────── Countries ─────────
export interface CountryWithStatus { code: string; status: CountryStatus; verifiedProfiles: number }

/** Route table (method + path). `:id` params are documented inline. */
export const ROUTES = {
  otpRequest: 'POST /auth/otp/request',
  otpVerify: 'POST /auth/otp/verify',
  me: 'GET /me',
  updateProfile: 'PUT /me/profile',
  getAnswers: 'GET /me/answers',
  putAnswers: 'PUT /me/answers',
  putPreferences: 'PUT /me/preferences',
  entitlements: 'GET /me/entitlements',
  feed: 'GET /feed?cursor=',
  topPicks: 'GET /top-picks',
  profile: 'GET /profiles/:id',
  interest: 'POST /interests',
  pass: 'POST /passes',
  incoming: 'GET /interests/incoming',
  matches: 'GET /matches',
  messages: 'GET /matches/:matchId/messages?before=',
  sendMessage: 'POST /matches/:matchId/messages',
  answerTopic: 'POST /matches/:matchId/messages/:messageId/answer',
  stageReady: 'POST /matches/:matchId/stage-ready',
  closeMatch: 'POST /matches/:matchId/close',
  passport: 'GET /passport',
  addPassport: 'POST /passport/destinations',
  removePassport: 'DELETE /passport/destinations/:id',
  devGrant: 'POST /billing/dev/grant',
  report: 'POST /reports',
  block: 'POST /blocks',
  countries: 'GET /countries',
} as const;
