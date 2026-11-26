/**
 * Moderation console client (`MODERATION_ROUTES` in @halal-meet/core). Staff only: members get 403.
 * Exposed as `api.admin`; `live.ts` builds it over HTTP and `mock/admin.ts` in memory.
 */
import type {
  AdminAccountDetail,
  AdminAuditPage,
  AdminAuditQuery,
  AdminPhotoItem,
  AdminPhotoStatus,
  AdminReportDetail,
  AdminReportListItem,
  AdminReportsQuery,
  AdminStats,
  MODERATION_ROUTES,
  PhotoDecisionBody,
  ReinstateBody,
  ResolveReportBody,
} from '@halal-meet/core';

export type DemoRole = 'member' | 'moderator' | 'admin';

export interface AdminApi {
  reports(query?: AdminReportsQuery): Promise<AdminReportListItem[]>; // GET /admin/reports?status=&category=
  report(id: string): Promise<AdminReportDetail>; // GET /admin/reports/:id
  resolveReport(id: string, body: ResolveReportBody): Promise<AdminReportDetail>; // POST /admin/reports/:id/resolve
  account(id: string): Promise<AdminAccountDetail>; // GET /admin/accounts/:id
  reinstate(id: string, body: ReinstateBody): Promise<AdminAccountDetail>; // POST /admin/accounts/:id/reinstate
  photos(status?: AdminPhotoStatus): Promise<AdminPhotoItem[]>; // GET /admin/photos?status=
  decidePhoto(id: string, body: PhotoDecisionBody): Promise<AdminPhotoItem>; // POST /admin/photos/:id
  audit(query?: AdminAuditQuery): Promise<AdminAuditPage>; // GET /admin/audit
  stats(): Promise<AdminStats>; // GET /admin/stats

  /** Mock-only: switch the demo account's role so the console can be tried without a server. */
  dev?: {
    setDemoRole(role: DemoRole): Promise<void>;
  };
}

export type ModerationRouteKey = keyof typeof MODERATION_ROUTES;

/** The live client's request helper, narrowed to moderation routes. */
export type AdminCall = <T>(
  route: ModerationRouteKey,
  opts?: { params?: Record<string, string>; query?: Record<string, string | null | undefined>; body?: unknown },
) => Promise<T>;

function unwrap<T>(data: unknown, key: string): T[] {
  if (Array.isArray(data)) return data as T[];
  const v = data && typeof data === 'object' ? (data as Record<string, unknown>)[key] : null;
  return Array.isArray(v) ? (v as T[]) : [];
}

export function createLiveAdminApi(call: AdminCall): AdminApi {
  return {
    reports: async (q = {}) => unwrap(await call('adminReports', { query: { status: q.status, category: q.category } }), 'reports'),
    report: (id) => call('adminReport', { params: { id } }),
    resolveReport: (id, body) => call('adminResolveReport', { params: { id }, body }),
    account: (id) => call('adminAccount', { params: { id } }),
    reinstate: (id, body) => call('adminReinstate', { params: { id }, body }),
    photos: async (status) => unwrap(await call('adminPhotos', { query: { status } }), 'photos'),
    decidePhoto: (id, body) => call('adminPhotoDecision', { params: { id }, body }),
    audit: (q = {}) =>
      call('adminAudit', {
        query: { moderatorId: q.moderatorId, subjectId: q.subjectId, action: q.action, before: q.before, limit: q.limit != null ? String(q.limit) : undefined },
      }),
    stats: () => call('adminStats'),
  };
}
