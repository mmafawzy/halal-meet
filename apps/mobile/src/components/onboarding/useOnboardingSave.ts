import { useCallback } from 'react';

import { useUpdateProfile } from '@/api/hooks';
import { tNow } from '@/i18n';
import { useSession, type OnboardingDraft } from '@/state/session';
import { useUi } from '@/state/ui';

import { buildProfileInput } from './draft';

/**
 * Saves onboarding progress to the API (PUT /me/profile with the full profile built from the draft).
 * Before the basics step there is no complete profile yet, so `save` is a no-op that resolves true.
 */
export function useOnboardingSave() {
  const mutation = useUpdateProfile();
  const { mutateAsync } = mutation;

  const save = useCallback(
    async (patch: Partial<OnboardingDraft> = {}): Promise<boolean> => {
      const s = useSession.getState();
      if (Object.keys(patch).length) s.updateDraft(patch);
      const input = buildProfileInput({ ...s.draft, ...patch });
      if (!input) return true;
      try {
        await mutateAsync({ ...input, locale: s.locale ?? 'en' });
        return true;
      } catch {
        useUi.getState().showToast({ message: tNow('common.states.error'), tone: 'danger' });
        return false;
      }
    },
    [mutateAsync],
  );

  return { save, saving: mutation.isPending };
}
