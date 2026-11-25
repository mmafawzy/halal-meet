import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const KEY = 'hm.token';

/** Bearer token persistence: expo-secure-store on device, localStorage on web. */
export const tokenStorage = {
  async get(): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(KEY) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(KEY);
  },
  async set(token: string | null): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        if (token) globalThis.localStorage?.setItem(KEY, token);
        else globalThis.localStorage?.removeItem(KEY);
      } catch {
        // storage unavailable (private mode) — token lives in memory only
      }
      return;
    }
    if (token) await SecureStore.setItemAsync(KEY, token);
    else await SecureStore.deleteItemAsync(KEY);
  },
};
