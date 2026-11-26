/**
 * React Query hooks for photos & photo privacy (PHOTO_ROUTES). Kept here rather than in api/hooks.ts so
 * the photos workstream stays self-contained.
 */
import type { PhotoRequestDecisionBody } from '@halal-meet/core';
import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';

import { api, ApiError, type PhotoUploadInput } from '@/api';
import { qk } from '@/api/hooks';
import { tNow } from '@/i18n';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';

export const photoKeys = {
  mine: ['photos', 'mine'] as const,
  incoming: ['photos', 'incoming'] as const,
  access: (ownerId: string) => ['photos', 'access', ownerId] as const,
};

/** Your photos change your main photo (GET /me) and how cards render. */
function invalidateMine(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: photoKeys.mine });
  void qc.invalidateQueries({ queryKey: qk.me });
}

export function useMyPhotos() {
  const token = useSession((s) => s.token);
  // Pending photos turn approved after review: poll gently while any is pending.
  return useQuery({
    queryKey: photoKeys.mine,
    queryFn: () => api.myPhotos(),
    enabled: !!token,
    refetchInterval: (q) => (q.state.data?.some((p) => p.status === 'pending') ? 5000 : false),
  });
}

/** Localised message for an upload error (409 photo_limit, 413, 415 …). */
export function photoErrorMessage(e: unknown): string {
  const code = e instanceof ApiError ? (e.status === 413 ? 'file_too_large' : e.code) : 'generic';
  const known = ['photo_limit', 'unsupported_type', 'file_too_large'];
  return tNow(`photos.manage.errors.${known.includes(code) ? code : 'generic'}`, { max: 6 });
}

export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PhotoUploadInput) => api.uploadPhoto(input),
    onSuccess: () => invalidateMine(qc),
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deletePhoto(id),
    onSuccess: () => {
      invalidateMine(qc);
      useUi.getState().showToast({ message: tNow('photos.manage.removed'), tone: 'success' });
    },
    onError: () => useUi.getState().showToast({ message: tNow('common.states.error'), tone: 'danger' }),
  });
}

export function useReorderPhotos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) => api.reorderPhotos(ids),
    onSuccess: (photos) => {
      qc.setQueryData(photoKeys.mine, photos);
      void qc.invalidateQueries({ queryKey: qk.me });
    },
    onError: () => useUi.getState().showToast({ message: tNow('common.states.error'), tone: 'danger' }),
  });
}

/** Requester side: can I request, is it pending, do I have access? */
export function usePhotoAccess(ownerId: string, enabled = true) {
  return useQuery({
    queryKey: photoKeys.access(ownerId),
    queryFn: () => api.photoAccess(ownerId),
    enabled: enabled && !!ownerId,
    retry: false,
    // While pending, check back occasionally so an approval shows without leaving the screen.
    refetchInterval: (q) => (q.state.data?.status === 'pending' ? 6000 : false),
  });
}

export function useRequestPhotoAccess(ownerId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.requestPhotoAccess(ownerId),
    onSuccess: (view) => {
      qc.setQueryData(photoKeys.access(ownerId), view);
      if (view.hasAccess) void qc.invalidateQueries({ queryKey: qk.profile(ownerId) });
    },
    onError: (e) => {
      const message =
        e instanceof ApiError && e.status === 429
          ? tNow('photos.access.limit')
          : e instanceof ApiError && e.status === 409
            ? tNow('photos.access.notRequestable')
            : tNow('common.states.error');
      useUi.getState().showToast({ message, tone: 'danger' });
    },
  });
}

export function useIncomingPhotoRequests() {
  const token = useSession((s) => s.token);
  return useQuery({ queryKey: photoKeys.incoming, queryFn: () => api.incomingPhotoRequests(), enabled: !!token, staleTime: 15_000 });
}

export function useDecidePhotoRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; decision: PhotoRequestDecisionBody['decision'] }) => api.decidePhotoRequest(v.id, v.decision),
    onSuccess: () => void qc.invalidateQueries({ queryKey: photoKeys.incoming }),
    onError: () => useUi.getState().showToast({ message: tNow('common.states.error'), tone: 'danger' }),
  });
}
