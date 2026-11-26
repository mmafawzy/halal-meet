/**
 * RevenueCat store adapter (iOS / Android dev & release builds only — `react-native-purchases` is a native
 * module, so it does not run on the web; in Expo Go the SDK runs in its own preview mode).
 *
 * - `appUserID` = our account id, so every webhook names the account and purchases survive a reinstall.
 * - The server is the source of truth: after a purchase/restore the caller re-syncs (`POST /billing/sync`)
 *   and refetches `/me`; the RevenueCat webhook updates the server in the background.
 */
import { type Sku } from '@halal-meet/core';
import { Platform } from 'react-native';
import Purchases, { LOG_LEVEL, PRORATION_MODE, type GoogleProductChangeInfo, type PurchasesPackage } from 'react-native-purchases';

import { CATALOG } from './config';
import { classifyPurchaseError, findPackageForSku } from './logic';
import type { BillingAdapter, PurchaseResult, StorePrices } from './types';

const PLAN_SKUS: Sku[] = ['plus_monthly', 'gold_monthly'];

export function createRevenueCatAdapter(opts: { apiKey: string; offering: string; getAccountId: () => string | null }): BillingAdapter | null {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') return null;

  let configured = false;
  let currentUser: string | null = null;
  let packagesCache: PurchasesPackage[] | null = null;
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  async function identify(accountId: string | null): Promise<void> {
    try {
      if (!configured) {
        if (!accountId) return; // configure only once we know who is buying
        if (__DEV__) void Purchases.setLogLevel(LOG_LEVEL.WARN);
        Purchases.configure({ apiKey: opts.apiKey, appUserID: accountId });
        Purchases.addCustomerInfoUpdateListener(() => emit());
        configured = true;
        currentUser = accountId;
        return;
      }
      if (!accountId) {
        if (currentUser) await Purchases.logOut();
        currentUser = null;
        packagesCache = null;
        return;
      }
      if (currentUser !== accountId) {
        await Purchases.logIn(accountId);
        currentUser = accountId;
        packagesCache = null;
      }
    } catch {
      // The store is unreachable; purchase/restore report it calmly.
    }
  }

  async function ready(): Promise<boolean> {
    await identify(opts.getAccountId());
    return configured && !!currentUser;
  }

  async function packages(): Promise<PurchasesPackage[]> {
    if (packagesCache) return packagesCache;
    const offerings = await Purchases.getOfferings();
    const preferred = offerings.all[opts.offering] ?? offerings.current;
    const rest = Object.values(offerings.all).filter((o) => o !== preferred);
    packagesCache = [preferred, ...rest].flatMap((o) => o?.availablePackages ?? []);
    return packagesCache;
  }

  const fail = (sku: Sku, status: PurchaseResult['status'], error?: unknown): PurchaseResult => ({ status, sku, changed: false, error });

  return {
    kind: 'store',
    identify,
    async prices() {
      const out: StorePrices = {};
      try {
        if (!(await ready())) return out;
        const list = await packages();
        for (const sku of Object.keys(CATALOG) as Sku[]) {
          const pkg = findPackageForSku(list, sku, Platform.OS, CATALOG);
          if (pkg) out[sku] = pkg.product.priceString;
        }
      } catch {
        // Fall back to the reference prices.
      }
      return out;
    },
    async purchase(sku, ctx) {
      try {
        if (!(await ready())) return fail(sku, 'unavailable');
        const pkg = findPackageForSku(await packages(), sku, Platform.OS, CATALOG);
        if (!pkg) return fail(sku, 'unavailable');
        // Android: replace the current plan instead of stacking a second subscription.
        let change: GoogleProductChangeInfo | null = null;
        const current = ctx?.currentSku ?? null;
        if (Platform.OS === 'android' && current && current !== sku && PLAN_SKUS.includes(current) && PLAN_SKUS.includes(sku)) {
          change = { oldProductIdentifier: CATALOG[current].android, prorationMode: PRORATION_MODE.IMMEDIATE_WITH_TIME_PRORATION };
        }
        await Purchases.purchasePackage(pkg, null, change);
        return { status: 'granted', sku, changed: true };
      } catch (error) {
        return fail(sku, classifyPurchaseError(error), error);
      }
    },
    async restore() {
      try {
        if (!(await ready())) return fail('plus_monthly', 'unavailable');
        const info = await Purchases.restorePurchases();
        const has = Object.keys(info.entitlements.active).length > 0 || info.nonSubscriptionTransactions.length > 0;
        return { status: 'granted', sku: 'plus_monthly', changed: has };
      } catch (error) {
        return fail('plus_monthly', classifyPurchaseError(error) === 'cancelled' ? 'cancelled' : 'error', error);
      }
    },
    onChange(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
