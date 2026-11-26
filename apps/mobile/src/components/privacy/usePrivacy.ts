/**
 * React Query hooks over `api.privacy` (PRIVACY_ROUTES): account state, pause, incognito, consents, deletion,
 * and the loose-end reads (saved preferences, blocked list, profiles shared with guardians).
 */
import type { ConsentKind, PrivacyStatus } from '@halal-meet/core';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api } from '@/api';
import { qk } from '@/api/hooks';
import { useSession } from '@/state/session';

export const privacyKeys = {
  all: ['privacy'] as const,
  status: ['privacy', 'status'] as const,
  consents: ['privacy', 'consents'] as const,
  preferences: ['privacy', 'preferences'] as const,
  blocks: ['privacy', 'blocks'] as const,
  /** Under ['guardians'] so the guardian hooks' invalidation refreshes it after share / unshare. */
  shares: ['guardians', 'shares'] as const,
};

/** Discovery surfaces that change when the account's visibility or blocks change. */
function invalidateDiscovery(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.feed });
  void qc.invalidateQueries({ queryKey: qk.topPicks });
  void qc.invalidateQueries({ queryKey: qk.incoming });
  void qc.invalidateQueries({ queryKey: qk.matches });
}

export function usePrivacyStatus(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: privacyKeys.status, queryFn: () => api.privacy.status(), enabled: enabled && !!token, staleTime: 15_000 });
}

function useStatusMutation<V>(fn: (v: V) => Promise<PrivacyStatus>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (status) => {
      qc.setQueryData(privacyKeys.status, status);
      invalidateDiscovery(qc);
    },
  });
}

/** `until`: ISO end, or null for "until I resume". */
export const usePause = () => useStatusMutation((until: string | null) => api.privacy.pause(until));
export const useResume = () => useStatusMutation((_: void) => api.privacy.resume());
export const useSetIncognito = () => useStatusMutation((on: boolean) => api.privacy.setIncognito(on));
export const useRequestDeletion = () => useStatusMutation((_: void) => api.privacy.requestDeletion());
export const useCancelDeletion = () => useStatusMutation((_: void) => api.privacy.cancelDeletion());

export function useConsents(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: privacyKeys.consents, queryFn: () => api.privacy.consents(), enabled: enabled && !!token });
}

export function usePutConsent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ kind, granted }: { kind: ConsentKind; granted: boolean }) => api.privacy.putConsent(kind, granted),
    onSuccess: (list) => qc.setQueryData(privacyKeys.consents, list),
  });
}

/** GET /me/preferences — saved preferences or the server defaults (`saved: false`). */
export function useMyPreferences(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: privacyKeys.preferences, queryFn: () => api.privacy.preferences(), enabled: enabled && !!token, staleTime: 60_000 });
}

export function useBlocks(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: privacyKeys.blocks, queryFn: () => api.privacy.blocks(), enabled: enabled && !!token });
}

export function useUnblock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (subjectId: string) => api.privacy.unblock(subjectId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: privacyKeys.blocks });
      invalidateDiscovery(qc);
    },
  });
}

export function useGuardianShares(enabled = true) {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: privacyKeys.shares, queryFn: () => api.privacy.guardianShares(), enabled: enabled && !!token });
}
