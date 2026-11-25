import type { Locale } from '@halal-meet/core';
import * as Updates from 'expo-updates';
import { DevSettings, I18nManager, Platform } from 'react-native';

import { useSession } from '../state/session';
import { i18n } from './index';

/** Sets `<html dir lang>` so react-native-web's logical styles (marginStart, row) mirror. */
export function applyWebDirection(locale: Locale) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  document.documentElement.lang = locale;
}

async function reloadApp() {
  if (Platform.OS === 'web') {
    globalThis.location?.reload();
    return;
  }
  try {
    await Updates.reloadAsync();
  } catch {
    DevSettings.reload();
  }
}

/** True when the native layout direction does not match the locale (needs a restart). */
export function needsNativeDirectionFlip(locale: Locale): boolean {
  if (Platform.OS === 'web') return false;
  return I18nManager.isRTL !== (locale === 'ar');
}

/**
 * Switches language. On native, RTL can only change after a restart: we set forceRTL and reload.
 * Returns true when a reload was triggered.
 */
export async function applyLocale(locale: Locale, opts: { reload?: boolean } = {}): Promise<boolean> {
  useSession.getState().setLocale(locale);
  await i18n.changeLanguage(locale);
  applyWebDirection(locale);
  if (Platform.OS === 'web') return false;
  const rtl = locale === 'ar';
  I18nManager.allowRTL(rtl);
  I18nManager.forceRTL(rtl);
  if (needsNativeDirectionFlip(locale) && opts.reload !== false) {
    // Let persisted state flush before restarting.
    useSession.getState().setRtlReloadAt(Date.now());
    await new Promise((r) => setTimeout(r, 250));
    await reloadApp();
    return true;
  }
  return false;
}

/**
 * Called once at startup: makes sure i18n, <html dir> and the native RTL flag match the saved locale.
 * Guards against reload loops (e.g. Expo Go refusing to flip) by allowing one attempt per minute.
 */
export async function syncDirectionOnLaunch(locale: Locale): Promise<void> {
  if (i18n.language !== locale) await i18n.changeLanguage(locale);
  applyWebDirection(locale);
  if (!needsNativeDirectionFlip(locale)) return;
  const last = useSession.getState().rtlReloadAt;
  if (last && Date.now() - last < 60_000) return;
  await applyLocale(locale);
}
