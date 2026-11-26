import type { NotificationPrefsInput } from '@halal-meet/core';

import { api, API_MODE } from '@/api';
import { getExpoPushToken, pushPlatform, requestPushPermission } from '@/lib/push';

/** Onboarding draft value → server `topPicksTime`. */
export function toServerTopPicksTime(time: 'after_maghrib' | 'morning' | 'evening' | 'custom', custom: string): string {
  if (time === 'after_maghrib') return 'maghrib';
  if (time === 'custom') return custom.trim();
  return time;
}

let registeredToken: string | null = null;

/**
 * Registers this device's Expo push token with `POST /me/devices` (live mode, iOS/Android, permission granted).
 * A no-op on the web and in mock mode. Safe to call repeatedly.
 */
export async function registerPushDevice(): Promise<void> {
  if (API_MODE !== 'live') return;
  const token = await getExpoPushToken();
  if (!token || token === registeredToken) return;
  try {
    await api.notifications.registerDevice(pushPlatform(), token);
    registeredToken = token;
  } catch {
    // retried on the next launch
  }
}

/** Forget this device on sign-out (best effort). */
export async function unregisterPushDevice(): Promise<void> {
  const token = registeredToken;
  registeredToken = null;
  if (!token) return;
  await api.notifications.removeDevice(token).catch(() => undefined);
}

/**
 * End of the onboarding notifications step: asks the OS for permission (only if the member wants
 * notifications, after the explanation — spec 01 §20), saves the preferences and registers the device.
 */
export async function finishNotificationSetup(opts: { wantsPush: boolean; topPicksTime: string }): Promise<void> {
  if (opts.wantsPush) await requestPushPermission();
  const body: NotificationPrefsInput = { topPicksTime: opts.topPicksTime };
  if (!opts.wantsPush) {
    // "Allow notifications" off: no pushes at all. The in-app inbox still shows everything.
    body.categories = { matches: false, messages: false, interests: false, family: false, topPicks: false, tips: false };
  }
  await api.notifications.putPrefs(body).catch(() => undefined);
  if (opts.wantsPush) await registerPushDevice();
}
