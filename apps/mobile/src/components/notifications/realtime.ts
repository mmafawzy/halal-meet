import { create } from 'zustand';

/** Whether the `GET /events` stream is open. While it is, chat polls slowly; when it drops, every 2 s again. */
export const useRealtime = create<{ connected: boolean; setConnected: (c: boolean) => void }>()((set) => ({
  connected: false,
  setConnected: (connected) => set({ connected }),
}));

/** Poll interval for an open chat: a slow safety net while realtime is connected, 2 s otherwise. */
export function chatPollInterval(): number {
  return useRealtime.getState().connected ? 15_000 : 2000;
}
