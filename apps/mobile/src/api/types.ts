/**
 * Client-side API surface. Mirrors `ROUTES` in @halal-meet/core (one method per route).
 * Two implementations: `live.ts` (HTTP) and `mock/` (in-memory demo backend).
 */
import type { BillingSyncResponse, MeBillingResponse } from '@halal-meet/core';
import type { IncomingPhotoRequest, Photo, PhotoAccessView, PhotoRequestDecisionBody } from '@halal-meet/core';
import type {
  Answer,
  AnswerTopicBody,
  BlockBody,
  CloseMatchBody,
  CountryWithStatus,
  DevGrantBody,
  Entitlements,
  FeedPage,
  Guardian,
  GuardianApprovalBody,
  GuardianDashboard,
  GuardianInvitePreview,
  GuardianInviteBody,
  GuardianInviteResponse,
  GuardianLink,
  GuardianOpinion,
  GuardianOpinionBody,
  GuardianUpdateBody,
  IncomingInterestsResponse,
  InterestBody,
  InterestResponse,
  Locale,
  MatchPreferencesInput,
  MatchSummary,
  MeResponse,
  Message,
  OtpRequestBody,
  OtpVerifyBody,
  OtpVerifyResponse,
  PassBody,
  PassportDestinationInput,
  PassportResponse,
  ProfileCard,
  ProfileInput,
  ReportBody,
  SendMessageBody,
  StageReadyBody,
  TopPicksResponse,
  Usage,
} from '@halal-meet/core';

import type { AdminApi } from './admin';
import type { PrivacyApi } from './privacy';
import type { NotificationsApi } from './notifications';

/** PUT /me/profile body. `locale` is sent alongside the profile so the server can localise pushes. */
export type ProfileUpdateBody = ProfileInput & { locale?: Locale };

export interface HalalMeetApi {
  readonly mode: 'mock' | 'live';

  /** Moderation console (MODERATION_ROUTES; staff only). See ./admin.ts. */
  admin: AdminApi;

  /** Privacy centre + loose-end reads (PRIVACY_ROUTES). See ./privacy.ts. */
  privacy: PrivacyApi;

  /** Push devices, notification preferences, inbox and realtime events (NOTIFICATION_ROUTES). See ./notifications.ts. */
  notifications: NotificationsApi;

  // Auth
  otpRequest(body: OtpRequestBody): Promise<void>; // POST /auth/otp/request
  otpVerify(body: OtpVerifyBody): Promise<OtpVerifyResponse>; // POST /auth/otp/verify

  // Me
  me(): Promise<MeResponse>; // GET /me
  updateProfile(body: ProfileUpdateBody): Promise<void>; // PUT /me/profile
  getAnswers(): Promise<Answer[]>; // GET /me/answers
  putAnswers(answers: Answer[]): Promise<void>; // PUT /me/answers
  putPreferences(body: MatchPreferencesInput): Promise<void>; // PUT /me/preferences
  entitlements(): Promise<Entitlements>; // GET /me/entitlements

  // Discover
  feed(cursor?: string | null): Promise<FeedPage>; // GET /feed?cursor=
  topPicks(): Promise<TopPicksResponse>; // GET /top-picks
  profile(id: string): Promise<ProfileCard>; // GET /profiles/:id

  // Interests & matches
  interest(body: InterestBody): Promise<InterestResponse>; // POST /interests (402 → LimitReachedError)
  pass(body: PassBody): Promise<void>; // POST /passes
  incoming(): Promise<IncomingInterestsResponse>; // GET /interests/incoming
  matches(): Promise<MatchSummary[]>; // GET /matches
  messages(matchId: string, before?: string | null): Promise<Message[]>; // GET /matches/:matchId/messages?before=
  sendMessage(matchId: string, body: SendMessageBody): Promise<Message>; // POST /matches/:matchId/messages
  answerTopic(matchId: string, messageId: string, body: AnswerTopicBody): Promise<Message>; // POST …/answer
  stageReady(matchId: string, body: StageReadyBody): Promise<void>; // POST /matches/:matchId/stage-ready
  closeMatch(matchId: string, body: CloseMatchBody): Promise<void>; // POST /matches/:matchId/close

  // Passport
  passport(): Promise<PassportResponse>; // GET /passport
  addPassport(body: PassportDestinationInput): Promise<void>; // POST /passport/destinations
  removePassport(id: string): Promise<void>; // DELETE /passport/destinations/:id

  // Billing
  devGrant(body: DevGrantBody): Promise<void>; // POST /billing/dev/grant
  myBilling(): Promise<MeBillingResponse>; // GET /me/billing (BILLING_ROUTES)
  billingSync(): Promise<BillingSyncResponse>; // POST /billing/sync (501 store_sync_unavailable without a RevenueCat API key)
  claimFreePass(): Promise<BillingSyncResponse>; // POST /billing/free-pass (Plus quarterly pass; 403 free_pass_unavailable)

  // Safety
  report(body: ReportBody): Promise<void>; // POST /reports
  block(body: BlockBody): Promise<void>; // POST /blocks

  // Countries
  countries(): Promise<CountryWithStatus[]>; // GET /countries

  // Guardians — member side (GUARDIAN_ROUTES in @halal-meet/core)
  guardians(): Promise<Guardian[]>; // GET /guardians
  inviteGuardian(body: GuardianInviteBody): Promise<GuardianInviteResponse>; // POST /guardians
  updateGuardian(id: string, body: GuardianUpdateBody): Promise<Guardian>; // PATCH /guardians/:id
  reissueGuardianInvite(id: string): Promise<GuardianInviteResponse>; // POST /guardians/:id/invite (409 once accepted)
  removeGuardian(id: string): Promise<void>; // DELETE /guardians/:id
  guardianOpinions(): Promise<GuardianOpinion[]>; // GET /guardians/opinions
  shareWithGuardians(subjectId: string): Promise<void>; // POST /guardians/shares (404 unknown profile, 400 self)
  unshareWithGuardians(subjectId: string): Promise<void>; // DELETE /guardians/shares/:subjectId

  // Guardians — guardian side
  guardianInvitePreview(code: string): Promise<GuardianInvitePreview>; // GET /guardian-invites/:code (public, 404 invalid/used)
  acceptGuardianInvite(code: string): Promise<GuardianLink>; // POST /guardian-invites/:code/accept (400 cannot_guard_self, 404, 409)
  guardianLinks(): Promise<GuardianLink[]>; // GET /guardian/members
  guardianDashboard(memberId: string): Promise<GuardianDashboard>; // GET /guardian/members/:memberId (403 guardian_paused)
  putGuardianOpinion(memberId: string, subjectId: string, body: GuardianOpinionBody): Promise<void>; // PUT /guardian/members/:memberId/opinions/:subjectId
  /** PUT /guardian/members/:memberId/approvals/:matchId (403 without approve_stages / paused, 404 unknown match, 409 wrong stage). */
  putGuardianApproval(memberId: string, matchId: string, body: GuardianApprovalBody): Promise<void>;
  leaveGuardianship(memberId: string): Promise<void>; // DELETE /guardian/members/:memberId

  // Photos & photo privacy (PHOTO_ROUTES in @halal-meet/core)
  myPhotos(): Promise<Photo[]>; // GET /me/photos
  uploadPhoto(input: PhotoUploadInput): Promise<Photo>; // POST /me/photos (multipart; 409 photo_limit, 413, 415 unsupported_type)
  deletePhoto(id: string): Promise<void>; // DELETE /me/photos/:id
  reorderPhotos(ids: string[]): Promise<Photo[]>; // PUT /me/photos/order (main photo first)
  requestPhotoAccess(ownerId: string): Promise<PhotoAccessView>; // POST /photos/requests (409 not_requestable, 429 rate_limited)
  photoAccess(ownerId: string): Promise<PhotoAccessView>; // GET /photos/requests/outgoing/:ownerId
  incomingPhotoRequests(): Promise<IncomingPhotoRequest[]>; // GET /photos/requests/incoming
  decidePhotoRequest(id: string, decision: PhotoRequestDecisionBody['decision']): Promise<void>; // PUT /photos/requests/:id (decline is silent / revokes)

  /** Mock-only helpers (undefined in live mode). */
  dev?: {
    /**
     * Simulates the guardian opening the invitation on their own phone and accepting it (the demo has
     * only one device). Also seeds one or two example opinions from that guardian on your matches.
     */
    simulateGuardianAccept(guardianId: string): Promise<Guardian>;
    /**
     * Simulates one of your accepted guardians with `approve_stages` approving the stage this match is waiting
     * on (or the next stage 5/6). Re-evaluates the stage straight away, like the server does.
     */
    simulateGuardianApproval(matchId: string): Promise<void>;
    /** What that (accepted) guardian's dashboard shows right now — same rules as GET /guardian/members/:memberId. */
    guardianDashboardFor(guardianId: string): Promise<GuardianDashboard>;
    /** The demo invitation code from a fictional member, so the guardian side can be tried on one device. */
    readonly demoGuardianInviteCode: string;
    /** Simulates passing ID + liveness verification (needed for Passport / Serious Interest). */
    verifyIdentity(): Promise<void>;
    /** Wipes the in-memory backend. */
    reset(): Promise<void>;
  };
}

/** A picked image for POST /me/photos: a file://, blob: or data: URI plus optional metadata from the picker. */
export interface PhotoUploadInput {
  uri: string;
  mimeType?: string | null;
  fileName?: string | null;
  /** 0 = main photo; omitted = append. */
  position?: number;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly body: unknown,
  ) {
    super(`API ${status}: ${code}`);
    this.name = 'ApiError';
  }
}

/** HTTP 402 `{ error: 'limit_reached', usage }`. */
export class LimitReachedError extends ApiError {
  constructor(
    public readonly usage: Usage | null,
    public readonly limit: 'interests' | 'serious' | 'passport' | 'saved' | string = 'interests',
    body: unknown = null,
  ) {
    super(402, 'limit_reached', body);
    this.name = 'LimitReachedError';
  }
}

export function isLimitReached(e: unknown): e is LimitReachedError {
  return e instanceof LimitReachedError || (e instanceof ApiError && e.status === 402);
}
