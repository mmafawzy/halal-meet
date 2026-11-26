/**
 * Moderation console v1 (spec 05 §3 Trust & Safety, §5 admin console).
 * Staff (moderators and admins) review member reports, act on accounts and messages, review photos and
 * read the audit log. Members are told about outcomes in neutral wording (notification kind `moderation`),
 * and a reporter only learns that their report was reviewed — never what happened to the other person.
 */
import type { ReportBody } from './api';

export type AdminAccountRole = 'member' | 'guardian' | 'matchmaker' | 'moderator' | 'admin';
export const STAFF_ROLES: readonly AdminAccountRole[] = ['moderator', 'admin'];
export function isStaffRole(role: string | null | undefined): boolean {
  return role === 'moderator' || role === 'admin';
}

export type AdminAccountStatus = 'active' | 'paused' | 'hidden' | 'engaged' | 'suspended' | 'banned' | 'deleted';
export type AdminReportStatus = 'open' | 'actioned' | 'dismissed';
export type AdminReportCategory = ReportBody['category'];
export type AdminReportPriority = 'p0' | 'p1' | 'p2';
export type AdminRiskFlag = 'money' | 'off_platform' | 'explicit' | 'aggression';
export type AdminPhotoStatus = 'pending' | 'approved' | 'rejected';

/** SLA buckets from spec 05 §3.3: P0 (minors, threats) < 1 h, P1 (scams, harassment) < 12 h, P2 < 48 h. */
export function reportPriority(category: string): AdminReportPriority {
  if (category === 'underage') return 'p0';
  if (category === 'scam' || category === 'harassment') return 'p1';
  return 'p2';
}

/** What a moderator can do when resolving a report. */
export type ResolveAction = 'dismiss' | 'warn' | 'hide_message' | 'suspend' | 'ban';
export const RESOLVE_ACTIONS: readonly ResolveAction[] = ['dismiss', 'warn', 'hide_message', 'suspend', 'ban'];
/** Every entry kind in `moderation_actions`. */
export type ModerationActionKind = ResolveAction | 'reinstate' | 'approve_photo' | 'reject_photo';

/** Suggested suspension lengths (days). The API accepts 1–365. */
export const SUSPEND_DAY_OPTIONS = [1, 3, 7, 30] as const;
export const MAX_SUSPEND_DAYS = 365;

/** Payload `type` of a `moderation` notification (clients render neutral, localised copy from it). */
export type ModerationNoticeType =
  | 'warning'
  | 'message_removed'
  | 'suspended'
  | 'banned'
  | 'reinstated'
  | 'photo_not_approved'
  | 'report_reviewed';

export interface ModerationNoticePayload {
  type: ModerationNoticeType;
  /** suspended: ISO end of the suspension. */
  until?: string;
  /** report_reviewed: the reporter's own report id. */
  reportId?: string;
  /** photo_not_approved: the photo id. */
  photoId?: string;
  /** message_removed: the message id. */
  messageId?: string;
}

// ───────── Read models ─────────

/** Compact account card used everywhere in the console. */
export interface AdminAccountSummary {
  id: string;
  firstName: string | null;
  gender: 'male' | 'female' | null;
  age: number | null;
  country: string | null;
  city: string | null;
  role: AdminAccountRole;
  status: AdminAccountStatus;
  suspendedUntil: string | null;
  identityVerified: boolean;
  photoUrl: string | null;
  createdAt: string;
}

export interface AdminEvidenceMessage {
  id: string;
  matchId: string;
  /** Who wrote it, relative to the report. */
  author: 'subject' | 'reporter' | 'other' | 'system';
  kind: string;
  body: string;
  risk: AdminRiskFlag | null;
  hidden: boolean;
  sentAt: string;
  /** True for messages the reporter attached; the rest are surrounding context. */
  reported: boolean;
}

export interface AdminReportBrief {
  id: string;
  category: AdminReportCategory;
  status: AdminReportStatus;
  createdAt: string;
  resolvedAt: string | null;
}

export interface ModerationActionEntry {
  id: string;
  action: ModerationActionKind;
  reason: string | null;
  meta: Record<string, unknown> | null;
  reportId: string | null;
  createdAt: string;
  moderator: { id: string; firstName: string | null; role: AdminAccountRole };
  subject: { id: string; firstName: string | null; status: AdminAccountStatus };
}

export interface AdminReportListItem {
  id: string;
  status: AdminReportStatus;
  category: AdminReportCategory;
  priority: AdminReportPriority;
  details: string | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  reporter: AdminAccountSummary;
  subject: AdminAccountSummary;
  evidenceCount: number;
  /** Risk-engine flags seen on the subject's messages. */
  riskFlags: AdminRiskFlag[];
  /** Other reports against the same subject (any status). */
  priorReportCount: number;
  /** Earlier moderation actions on the subject. */
  priorActionCount: number;
}

export interface AdminReportDetail extends AdminReportListItem {
  /** Reported messages plus a few around each (or the latest of their conversation when none were attached). */
  evidence: AdminEvidenceMessage[];
  /** Other reports against the subject, newest first. */
  subjectReports: AdminReportBrief[];
  /** Moderation history of the subject, newest first. */
  subjectActions: ModerationActionEntry[];
}

export interface AdminPhotoItem {
  id: string;
  status: AdminPhotoStatus;
  /** Where staff can load the image (null when the storage driver has no URL for it). */
  url: string | null;
  mime: string;
  width: number | null;
  height: number | null;
  position: number;
  createdAt: string;
  owner: AdminAccountSummary;
}

export interface AdminAccountDetail {
  account: AdminAccountSummary & {
    /** Masked (C4 data stays hidden in the console). */
    phoneMasked: string;
    locale: string;
    lastActiveAt: string | null;
  };
  profile: {
    about: string | null;
    profession: string | null;
    maritalStatus: string;
    intention: string;
    halalMode: string;
    languages: string[];
  } | null;
  verifications: Array<{ kind: string; status: string; decidedAt: string | null }>;
  reportsAgainst: AdminReportBrief[];
  reportsBy: AdminReportBrief[];
  actions: ModerationActionEntry[];
  photos: Array<{ id: string; status: AdminPhotoStatus; url: string | null; createdAt: string }>;
  activeMatches: number;
}

export interface AdminAuditPage {
  entries: ModerationActionEntry[];
  /** Pass as `before` for the next page; null at the end. */
  nextCursor: string | null;
}

export interface AdminStats {
  openReports: number;
  openByPriority: Record<AdminReportPriority, number>;
  pendingPhotos: number;
  actionsLast7Days: number;
  actionsByKind: Partial<Record<ModerationActionKind, number>>;
  suspendedAccounts: number;
  bannedAccounts: number;
}

// ───────── Bodies ─────────

export interface ResolveReportBody {
  action: ResolveAction;
  /** Internal reason, shown in the audit log (never sent to members). */
  reason: string;
  /** suspend: 1–365 days. */
  days?: number;
  /** hide_message: a message written by the subject. */
  messageId?: string;
}

export interface ReinstateBody { reason: string }

export interface PhotoDecisionBody {
  decision: 'approve' | 'reject';
  /** Required when rejecting. */
  reason?: string;
}

export interface AdminReportsQuery {
  status?: AdminReportStatus;
  category?: AdminReportCategory;
}

export interface AdminAuditQuery {
  moderatorId?: string;
  subjectId?: string;
  action?: ModerationActionKind;
  before?: string;
  limit?: number;
}

/**
 * All routes require a staff role (moderator or admin): members get 403 `{ error: 'forbidden' }`.
 * Errors: 404 `report_not_found` / `account_not_found` / `photo_not_found`, 409 `report_closed` /
 * `not_restricted`, 400 `days_required` / `message_required` / `message_not_from_subject` /
 * `reason_required` / `cannot_moderate_self`, 403 `staff_account` (only admins can act on staff).
 */
export const MODERATION_ROUTES = {
  adminReports: 'GET /admin/reports?status=&category=',
  adminReport: 'GET /admin/reports/:id',
  adminResolveReport: 'POST /admin/reports/:id/resolve',
  adminAccount: 'GET /admin/accounts/:id',
  adminReinstate: 'POST /admin/accounts/:id/reinstate',
  adminPhotos: 'GET /admin/photos?status=',
  adminPhotoDecision: 'POST /admin/photos/:id',
  adminAudit: 'GET /admin/audit?moderatorId=&subjectId=&action=&before=&limit=',
  adminStats: 'GET /admin/stats',
} as const;
