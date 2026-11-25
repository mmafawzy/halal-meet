import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSession } from '../state/session';
import { createLiveApi } from './live';
import { createMockApi } from './mock';
import type { HalalMeetApi } from './types';

export * from './types';

export const API_MODE: 'mock' | 'live' = process.env.EXPO_PUBLIC_API_MODE === 'live' ? 'live' : 'mock';
export const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

function build(): HalalMeetApi {
  if (API_MODE === 'live') {
    return createLiveApi({
      baseUrl: API_URL,
      getToken: () => useSession.getState().token,
      onUnauthorized: () => useSession.getState().setToken(null),
    });
  }
  return createMockApi({
    storage: AsyncStorage,
    getLocale: () => useSession.getState().locale ?? 'en',
  });
}

/** The single API client used by the app. */
export const api: HalalMeetApi = build();

/** Dev purchases (`POST /billing/dev/grant`) are allowed in mock mode and in dev builds. */
export const DEV_BILLING = API_MODE === 'mock' || __DEV__;
