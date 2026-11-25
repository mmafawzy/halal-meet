import type { ProfileCard, Usage } from '@halal-meet/core';
import { create } from 'zustand';

export interface ToastState {
  id: number;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Called when the toast disappears without the action being pressed. */
  onExpire?: () => void;
  durationMs: number;
  tone: 'neutral' | 'success' | 'danger';
}

interface UiState {
  /** Screen 27: daily interest limit reached. */
  limitSheet: { visible: boolean; card: ProfileCard | null; usage: Usage | null };
  toast: ToastState | null;
  /** Cards hidden optimistically (passed / interest pending) — filtered out of feed & Top Picks. */
  hiddenIds: Record<string, true>;
  hide: (id: string) => void;
  unhide: (id: string) => void;
  openLimitSheet: (card?: ProfileCard | null, usage?: Usage | null) => void;
  closeLimitSheet: () => void;
  showToast: (t: Omit<ToastState, 'id' | 'durationMs' | 'tone'> & Partial<Pick<ToastState, 'durationMs' | 'tone'>>) => void;
  dismissToast: (id: number, viaAction?: boolean) => void;
}

let nextToastId = 1;

export const useUi = create<UiState>()((set, get) => ({
  limitSheet: { visible: false, card: null, usage: null },
  toast: null,
  hiddenIds: {},
  hide: (id) => set((s) => ({ hiddenIds: { ...s.hiddenIds, [id]: true } })),
  unhide: (id) =>
    set((s) => {
      const next = { ...s.hiddenIds };
      delete next[id];
      return { hiddenIds: next };
    }),
  openLimitSheet: (card = null, usage = null) => set({ limitSheet: { visible: true, card, usage } }),
  closeLimitSheet: () => set((s) => ({ limitSheet: { ...s.limitSheet, visible: false } })),
  showToast: (t) => {
    // A new toast replaces the previous one; the replaced toast "expires" (its deferred action runs).
    const prev = get().toast;
    if (prev) prev.onExpire?.();
    set({ toast: { durationMs: 3000, tone: 'neutral', ...t, id: nextToastId++ } });
  },
  dismissToast: (id, viaAction = false) => {
    const cur = get().toast;
    if (!cur || cur.id !== id) return;
    if (!viaAction) cur.onExpire?.();
    set({ toast: null });
  },
}));
