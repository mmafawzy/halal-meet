import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useCallback } from 'react';

import { api } from '@/api';
import { tokenStorage } from '@/api/tokenStorage';
import { tNow } from '@/i18n';
import { useLocal } from '@/state/local';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';

import { useMeLocal } from './meStore';

/** Sign out, and the mock-only "Reset all demo data" (Profile → Demo tools → Reset). */
export function useAccountActions() {
  const qc = useQueryClient();

  const signOut = useCallback(async () => {
    await tokenStorage.set(null);
    useSession.getState().signOut(); // keeps the chosen language
    router.replace('/');
    qc.clear();
  }, [qc]);

  const resetDemo = useCallback(async () => {
    await api.dev?.reset();
    useLocal.getState().reset();
    useMeLocal.getState().reset();
    await signOut();
    useUi.getState().showToast({ message: tNow('me.demo.resetDone'), tone: 'success' });
  }, [signOut]);

  return { signOut, resetDemo };
}
