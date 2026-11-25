import type { ProfileCard } from '@halal-meet/core';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { persistStorage } from './storage';

/**
 * Device-only state. Guardians used to live here; they now come from the guardians API
 * (`useGuardians()` in src/api/hooks.ts, types from @halal-meet/core).
 */
interface LocalState {
  /** "Save for later" bookmarks (no API route yet — kept on device). */
  saved: ProfileCard[];
  save: (card: ProfileCard) => void;
  unsave: (id: string) => void;
  /** Profiles shared with guardians from this device (POST /guardians/shares has no GET counterpart). */
  sharedWithGuardians: string[];
  markShared: (id: string, shared: boolean) => void;
  reset: () => void;
}

export const useLocal = create<LocalState>()(
  persist(
    (set) => ({
      saved: [],
      save: (card) => set((s) => ({ saved: [card, ...s.saved.filter((c) => c.id !== card.id)] })),
      unsave: (id) => set((s) => ({ saved: s.saved.filter((c) => c.id !== id) })),
      sharedWithGuardians: [],
      markShared: (id, shared) =>
        set((s) => ({
          sharedWithGuardians: shared ? [id, ...s.sharedWithGuardians.filter((x) => x !== id)] : s.sharedWithGuardians.filter((x) => x !== id),
        })),
      reset: () => set({ saved: [], sharedWithGuardians: [] }),
    }),
    {
      name: 'hm.local.v1',
      storage: persistStorage,
      // Older snapshots also carried device-only guardians; drop them on load.
      partialize: ({ saved, sharedWithGuardians }) => ({ saved, sharedWithGuardians }),
      merge: (persisted, current) => {
        const p = persisted as { saved?: ProfileCard[]; sharedWithGuardians?: string[] } | undefined;
        return { ...current, saved: p?.saved ?? [], sharedWithGuardians: p?.sharedWithGuardians ?? [] };
      },
    },
  ),
);
