/**
 * Web / node build of the RevenueCat adapter: the native SDK is not bundled here (see `revenuecat.native.ts`).
 * On the web, purchases happen in the iOS / Android apps, so there is no store adapter.
 */
import type { BillingAdapter } from './types';

export function createRevenueCatAdapter(_opts: { apiKey: string; offering: string; getAccountId: () => string | null }): BillingAdapter | null {
  return null;
}
