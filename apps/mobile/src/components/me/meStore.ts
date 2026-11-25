import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from '@/state/storage';

/**
 * Privacy settings that have no API route yet (Incognito, Pause matchmaking).
 * Kept on the device and labelled as such in the UI.
 * TODO: move server-side once the contract has a privacy/settings route.
 */
interface MeLocalState {
  incognito: boolean;
  /** ISO date the pause ends, 'manual' for "until I resume", or null when active. */
  pausedUntil: string | null;
  setIncognito: (v: boolean) => void;
  pause: (until: string) => void;
  resume: () => void;
  reset: () => void;
}

export const useMeLocal = create<MeLocalState>()(
  persist(
    (set) => ({
      incognito: false,
      pausedUntil: null,
      setIncognito: (incognito) => set({ incognito }),
      pause: (pausedUntil) => set({ pausedUntil }),
      resume: () => set({ pausedUntil: null }),
      reset: () => set({ incognito: false, pausedUntil: null }),
    }),
    { name: 'hm.me.v1', storage: persistStorage },
  ),
);

/** True while a pause is in effect (expired timed pauses count as resumed). */
export function isPaused(pausedUntil: string | null, now = new Date()): boolean {
  if (!pausedUntil) return false;
  if (pausedUntil === 'manual') return true;
  return new Date(pausedUntil).getTime() > now.getTime();
}
