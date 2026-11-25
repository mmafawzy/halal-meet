import type { ProfileInput } from '@halal-meet/core';
import { useCallback } from 'react';

import { useMe, useUpdateProfile } from '@/api/hooks';
import { tNow } from '@/i18n';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';

import { draftPatchFromProfile, toProfileInput } from './profileInput';

/**
 * Saves a partial change to the member's profile: merges it into the current profile from GET /me
 * and sends the full body to PUT /me/profile. Resolves to true on success; shows a toast on failure.
 */
export function useSaveProfile() {
  const me = useMe();
  const mutation = useUpdateProfile();
  const { mutateAsync } = mutation;
  const profile = me.data?.profile ?? null;

  const save = useCallback(
    async (patch: Partial<ProfileInput>, successMessage?: string): Promise<boolean> => {
      if (!profile) return false;
      const input: ProfileInput = { ...toProfileInput(profile), ...patch };
      const s = useSession.getState();
      try {
        await mutateAsync({ ...input, locale: s.locale ?? 'en' });
        s.updateDraft(draftPatchFromProfile(input, s.draft));
        if (successMessage) useUi.getState().showToast({ message: successMessage, tone: 'success', durationMs: 2200 });
        return true;
      } catch {
        useUi.getState().showToast({ message: tNow('common.states.error'), tone: 'danger' });
        return false;
      }
    },
    [profile, mutateAsync],
  );

  return { save, saving: mutation.isPending, profile, me };
}
