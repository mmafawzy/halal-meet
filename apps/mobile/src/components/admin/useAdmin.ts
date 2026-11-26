/** React Query hooks for the moderation console (`api.admin`). */
import type {
  AdminAuditQuery,
  AdminPhotoStatus,
  AdminReportCategory,
  AdminReportStatus,
  PhotoDecisionBody,
  ResolveReportBody,
} from '@halal-meet/core';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import type { DemoRole } from '@/api/admin';
import { qk } from '@/api/hooks';
import { ApiError } from '@/api/types';

export const adminKeys = {
  all: ['admin'] as const,
  stats: ['admin', 'stats'] as const,
  reports: (status: AdminReportStatus, category?: AdminReportCategory) => ['admin', 'reports', status, category ?? 'all'] as const,
  report: (id: string) => ['admin', 'report', id] as const,
  account: (id: string) => ['admin', 'account', id] as const,
  photos: (status: AdminPhotoStatus) => ['admin', 'photos', status] as const,
  audit: (q: AdminAuditQuery) => ['admin', 'audit', q.moderatorId ?? '', q.subjectId ?? '', q.action ?? ''] as const,
};

/** Never retry 403/404s (the console shows them straight away). */
const retry = (count: number, e: unknown) => !(e instanceof ApiError && e.status < 500) && count < 1;

export function useAdminStats(enabled = true) {
  return useQuery({ queryKey: adminKeys.stats, queryFn: () => api.admin.stats(), enabled, retry, staleTime: 10_000 });
}

export function useAdminReports(status: AdminReportStatus, category?: AdminReportCategory) {
  return useQuery({ queryKey: adminKeys.reports(status, category), queryFn: () => api.admin.reports({ status, category }), retry, staleTime: 10_000 });
}

export function useAdminReport(id: string | undefined) {
  return useQuery({ queryKey: adminKeys.report(id ?? ''), queryFn: () => api.admin.report(id!), enabled: !!id, retry });
}

export function useAdminAccount(id: string | undefined) {
  return useQuery({ queryKey: adminKeys.account(id ?? ''), queryFn: () => api.admin.account(id!), enabled: !!id, retry });
}

export function useAdminPhotos(status: AdminPhotoStatus) {
  return useQuery({ queryKey: adminKeys.photos(status), queryFn: () => api.admin.photos(status), retry, staleTime: 10_000 });
}

export function useAdminAudit(q: AdminAuditQuery) {
  return useInfiniteQuery({
    queryKey: adminKeys.audit(q),
    queryFn: ({ pageParam }) => api.admin.audit({ ...q, before: pageParam ?? undefined, limit: 30 }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    retry,
  });
}

function useInvalidateAdmin() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: adminKeys.all });
}

export function useResolveReport() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: ResolveReportBody }) => api.admin.resolveReport(id, body),
    onSettled: invalidate,
  });
}

export function useReinstate() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.admin.reinstate(id, { reason }),
    onSettled: invalidate,
  });
}

export function useDecidePhoto() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, body }: { id: string; body: PhotoDecisionBody }) => api.admin.decidePhoto(id, body),
    onSettled: invalidate,
  });
}

/** Mock only: switch the demo account's role (refreshes GET /me and the console). */
export function useSetDemoRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (role: DemoRole) => api.admin.dev!.setDemoRole(role),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.me });
      void qc.invalidateQueries({ queryKey: adminKeys.all });
    },
  });
}

/** Maps an API error to an `admin.errors.*` key. */
export function adminErrorKey(e: unknown): string {
  const code = e instanceof ApiError ? e.code : '';
  const known = ['report_closed', 'staff_account', 'cannot_moderate_self', 'not_restricted', 'forbidden'];
  return `admin.errors.${known.includes(code) ? code : 'generic'}`;
}
