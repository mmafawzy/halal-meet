/**
 * Billing configuration for this build.
 *
 * RevenueCat public SDK keys (safe to ship in the app) come from, in order:
 *   1. `EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` (inlined at build time);
 *   2. `expo.extra.billing.revenuecatIosKey` / `revenuecatAndroidKey` in app.json / app.config.
 * Product ids / package identifiers can be overridden with `expo.extra.billing.products` (same shape as core
 * `STORE_PRODUCTS`, partial) and the offering with `expo.extra.billing.offering`.
 */
import { RC_OFFERING_ID, storeCatalog, type Sku, type StoreProduct, type StoreProductOverrides } from '@halal-meet/core';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { API_MODE } from '@/api/index';

import { chooseAdapter, type AdapterChoice } from './logic';

interface BillingExtra {
  revenuecatIosKey?: string | null;
  revenuecatAndroidKey?: string | null;
  offering?: string | null;
  products?: StoreProductOverrides;
}

function extra(): BillingExtra {
  const e = (Constants.expoConfig?.extra ?? {}) as { billing?: BillingExtra };
  return e.billing ?? {};
}

/** The RevenueCat public SDK key for this platform, or null. */
export function revenueCatKey(): string | null {
  if (Platform.OS === 'ios') return process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY || extra().revenuecatIosKey || null;
  if (Platform.OS === 'android') return process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY || extra().revenuecatAndroidKey || null;
  return null;
}

export const RC_OFFERING: string = extra().offering || RC_OFFERING_ID;

/** SKU ↔ store catalogue used by the app (core defaults + app config overrides). */
export const CATALOG: Record<Sku, StoreProduct> = storeCatalog(extra().products);

/** Android application id (for the Play "manage subscription" deep link). */
export const ANDROID_PACKAGE: string | null = Constants.expoConfig?.android?.package ?? null;

export const ADAPTER_CHOICE: AdapterChoice = chooseAdapter({
  apiMode: API_MODE,
  os: Platform.OS,
  devBuild: typeof __DEV__ !== 'undefined' && __DEV__,
  hasKey: !!revenueCatKey(),
});
