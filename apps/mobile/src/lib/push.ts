/**
 * Push notifications on the device (expo-notifications).
 *
 * - Permission is asked once, at the onboarding notifications step, after explaining what we send (spec 01 §20).
 * - In live mode on iOS/Android the Expo push token is registered with `POST /me/devices`; on the web and in
 *   mock mode registration is a no-op (the in-app inbox still works everywhere).
 * - Taps route with `data.url` (set by the server from `notificationTarget()`), see `NotificationsBridge`.
 */
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

export type PushPermission = 'granted' | 'denied' | 'undetermined' | 'unsupported';

const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

let handlerSet = false;
/** Foreground pushes show as a banner (quietly: no sound while the app is open). */
export function configureForegroundHandling(): void {
  if (!isNative || handlerSet) return;
  handlerSet = true;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: true }),
  });
  if (Platform.OS === 'android') {
    void Notifications.setNotificationChannelAsync('default', {
      name: 'Halal Meet',
      importance: Notifications.AndroidImportance.DEFAULT,
    }).catch(() => undefined);
  }
}

export async function getPushPermission(): Promise<PushPermission> {
  if (!isNative) return 'unsupported';
  try {
    const { status } = await Notifications.getPermissionsAsync();
    return status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined';
  } catch {
    return 'unsupported';
  }
}

/** Shows the OS prompt (native only). Never throws. */
export async function requestPushPermission(): Promise<PushPermission> {
  if (!isNative) return 'unsupported';
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.status === 'granted') return 'granted';
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted' ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

/** The Expo push token, or null on the web, simulators, without permission or without an EAS project id. */
export async function getExpoPushToken(): Promise<string | null> {
  if (!isNative || !Device.isDevice) return null;
  if ((await getPushPermission()) !== 'granted') return null;
  const extra = Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined;
  const projectId = extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) return null;
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch {
    return null;
  }
}

export const pushPlatform = (): 'ios' | 'android' | 'web' => (Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web');

let lastHandledId: string | null = null;

/** Subscribes to notification taps (including the one that launched the app). Returns an unsubscribe. */
export function onNotificationTap(handler: (data: Record<string, unknown>) => void): () => void {
  if (!isNative) return () => undefined;
  const handle = (r: Notifications.NotificationResponse) => {
    const id = r.notification.request.identifier;
    if (id === lastHandledId) return;
    lastHandledId = id;
    handler((r.notification.request.content.data ?? {}) as Record<string, unknown>);
  };
  const last = Notifications.getLastNotificationResponse();
  if (last) handle(last);
  const sub = Notifications.addNotificationResponseReceivedListener(handle);
  return () => sub.remove();
}
