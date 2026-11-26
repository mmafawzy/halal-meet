/**
 * Purchase adapter.
 *
 * Everything that spends money goes through here, so the rest of the app never talks to a store SDK directly.
 * Three implementations, chosen once per build (`ADAPTER_CHOICE`, see `logic.ts#chooseAdapter`):
 *
 * - **store** (RevenueCat, `revenuecat.native.ts`): live mode on iOS/Android with a RevenueCat key
 *   (`EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` or `expo.extra.billing`).
 *   `appUserID` = our account id (set by `<BillingBridge />` after sign-in). Offerings → packages → purchase,
 *   restore, customer-info listener → refetch `/me`. The server learns about purchases from the RevenueCat
 *   webhook; the app also calls `POST /billing/sync` right after a purchase (501 when not configured — fine).
 * - **dev** (`POST /billing/dev/grant`): mock mode, and live dev builds without keys / on the web. The server
 *   refuses the dev grant in production.
 * - **unavailable**: live release builds on the web ("purchases are made in the mobile app") or without keys.
 *
 * Prices are display-only: the store's localised `priceString` when available, otherwise `SKU_PRICES_USD`
 * with the "price shown at checkout" note.
 */
import { PLAN_LIMITS, SKU_PRICES_USD, type PlanTier, type Sku } from '@halal-meet/core';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { Linking, Platform } from 'react-native';

import { api } from '@/api';
import { useDevGrant, useMe, useMyBilling } from '@/api/hooks';
import { useLocale } from '@/i18n';
import { formatPrice } from '@/lib/format';
import { useSession } from '@/state/session';

import { ADAPTER_CHOICE, ANDROID_PACKAGE, CATALOG, RC_OFFERING, revenueCatKey } from './config';
import { manageSubscriptionUrl, storeProductId } from './logic';
import { createRevenueCatAdapter } from './revenuecat';
import type { BillingAdapter, PurchaseContext, PurchaseResult, StorePrices } from './types';

export type { BillingAdapter, PurchaseContext, PurchaseResult, PurchaseStatus, StorePrices } from './types';
export { CATALOG } from './config';

/** The three-day Plus trial is offered once, after the first daily allowance is used up (spec 02 §6.2). */
export const TRIAL_DAYS = 3;
export const TRIAL_SKU: Sku = 'plus_monthly';

/** Days between the store's pre-renewal reminder and the renewal itself. */
export const RENEWAL_REMINDER_DAYS = 2;

/** Which SKU buys which plan. Elite has no self-serve SKU (it is a concierge application). */
export function skuForTier(tier: PlanTier): Sku | 'free' {
  switch (tier) {
    case 'free':
      return 'free';
    case 'plus':
      return 'plus_monthly';
    case 'gold':
    case 'elite':
      return 'gold_monthly';
  }
}

/** The plan a SKU grants (the inverse of `skuForTier`, for optimistic UI while a purchase settles). */
export function tierForSku(sku: Sku): PlanTier {
  switch (sku) {
    case 'plus_monthly':
      return 'plus';
    case 'gold_monthly':
      return 'gold';
    // Passport SKUs are add-ons: they never change the base plan.
    case 'passport_pass_7d':
    case 'passport_addon_monthly':
      return 'free';
  }
}

/** True when the SKU is a recurring subscription (as opposed to a one-off pass / add-on). */
export function isSubscription(sku: Sku): boolean {
  return sku === 'plus_monthly' || sku === 'gold_monthly' || sku === 'passport_addon_monthly';
}

/** US anchor price (minor units). Regional prices come from the store — see `useBilling().priceOf`. */
export function usdPrice(sku: Sku): number {
  return SKU_PRICES_USD[sku];
}

/** When a subscription started now would next renew (used for the trial block, which must be exact). */
export function renewalDateFor(sku: Sku, from = new Date()): Date {
  const d = new Date(from);
  if (sku === 'passport_pass_7d') d.setDate(d.getDate() + 7);
  else d.setMonth(d.getMonth() + 1);
  return d;
}

/** When the trial's first charge lands, if the trial is started now. */
export function trialRenewsAt(from = new Date()): Date {
  const d = new Date(from);
  d.setDate(d.getDate() + TRIAL_DAYS);
  return d;
}

/** What it means to hold this SKU, in plan terms. */
export function skuPlan(sku: Sku): { tier: PlanTier; dailyInterests: number | null; passportIncluded: boolean } {
  const tier = tierForSku(sku);
  const limits = PLAN_LIMITS[tier];
  return { tier, dailyInterests: limits.dailyInterests, passportIncluded: limits.passport.included };
}

/** Store product ids per SKU on this platform (from the shared core catalogue + app config overrides). */
export const STORE_PRODUCT_IDS: Record<Sku, string> = {
  plus_monthly: storeProductId('plus_monthly', Platform.OS, CATALOG),
  gold_monthly: storeProductId('gold_monthly', Platform.OS, CATALOG),
  passport_pass_7d: storeProductId('passport_pass_7d', Platform.OS, CATALOG),
  passport_addon_monthly: storeProductId('passport_addon_monthly', Platform.OS, CATALOG),
};

const noop = () => () => undefined;

/**
 * Dev / mock: the server hands out the entitlement directly (no money involved). Only selected in mock mode
 * or dev builds; the server refuses it in production.
 */
const devAdapter: BillingAdapter = {
  kind: 'dev',
  identify: async () => undefined,
  prices: async () => ({}),
  async purchase(sku) {
    try {
      await api.devGrant({ sku });
      return { status: 'granted', sku, changed: true };
    } catch (error) {
      return { status: 'error', sku, changed: false, error };
    }
  },
  async restore() {
    // Nothing to restore: dev entitlements live on the server and are already applied.
    return { status: 'granted', sku: 'plus_monthly', changed: false };
  },
  onChange: noop,
};

/** Live web (or a release build without store keys): purchases happen in the iOS / Android apps. */
const unavailableAdapter = (reason: 'web' | 'not_configured'): BillingAdapter => ({
  kind: 'unavailable',
  unavailableReason: reason,
  identify: async () => undefined,
  prices: async () => ({}),
  purchase: async (sku) => ({ status: 'unavailable', sku, changed: false }),
  restore: async () => ({ status: 'unavailable', sku: 'plus_monthly', changed: false }),
  onChange: noop,
});

let adapter: BillingAdapter | null = null;

/** The active adapter for this build. */
export function billingAdapter(): BillingAdapter {
  if (adapter) return adapter;
  if (ADAPTER_CHOICE.kind === 'store') {
    const key = revenueCatKey();
    adapter = key ? createRevenueCatAdapter({ apiKey: key, offering: RC_OFFERING, getAccountId: () => useSession.getState().accountId }) : null;
  }
  adapter ??= ADAPTER_CHOICE.kind === 'unavailable' ? unavailableAdapter(ADAPTER_CHOICE.reason ?? 'web') : ADAPTER_CHOICE.kind === 'dev' ? devAdapter : unavailableAdapter('not_configured');
  return adapter;
}

/** True when a purchase can actually be completed in this build. */
export const billingAvailable = (): boolean => billingAdapter().kind !== 'unavailable';

/** True while purchases are simulated (the UI labels them honestly — never pretend it is real money). */
export const isSimulatedBilling = (): boolean => billingAdapter().kind === 'dev';

/** Why purchases are unavailable in this build (null when they are available). */
export const unavailableReason = (): 'web' | 'not_configured' | null => billingAdapter().unavailableReason ?? null;

/**
 * Keeps the store SDK signed in as the current account and refetches entitlements when the store reports a
 * change (renewal, refund, purchase on another device). Mounted once in the root layout.
 */
export function BillingBridge(): ReactElement | null {
  const token = useSession((s) => s.token);
  const accountId = useSession((s) => s.accountId);
  const qc = useQueryClient();
  const id = token ? accountId : null;
  useEffect(() => {
    void billingAdapter().identify(id);
  }, [id]);
  useEffect(() => billingAdapter().onChange(() => void qc.invalidateQueries()), [qc]);
  return null;
}

const PLAN_SKU: Partial<Record<PlanTier, Sku>> = { plus: 'plus_monthly', gold: 'gold_monthly' };

/**
 * The public surface used by screens: purchase / restore / manage, store prices, and honest state flags.
 * Caches (me, entitlements, passport, billing) are refreshed after every change.
 */
export function useBilling() {
  const qc = useQueryClient();
  const locale = useLocale();
  const devGrant = useDevGrant();
  const me = useMe();
  const impl = billingAdapter();
  const myBilling = useMyBilling();
  const [busy, setBusy] = useState(false);
  const token = useSession((s) => s.token);

  const prices = useQuery({
    queryKey: ['billing', 'prices', impl.kind] as const,
    queryFn: () => impl.prices(),
    enabled: impl.kind === 'store' && !!token,
    staleTime: 60 * 60_000,
  });
  const storePrices: StorePrices = prices.data ?? {};

  /** After a store change: pull from RevenueCat on the server when possible, then refetch everything. */
  const settle = useCallback(async () => {
    try {
      await api.billingSync();
    } catch {
      // 501 when the server has no RevenueCat API key — the webhook will update it shortly.
    }
    await qc.invalidateQueries();
    // The webhook can trail the purchase by a few seconds.
    setTimeout(() => void qc.invalidateQueries(), 3_000);
    setTimeout(() => void qc.invalidateQueries(), 10_000);
  }, [qc]);

  const purchase = useCallback(
    async (sku: Sku): Promise<PurchaseResult> => {
      setBusy(true);
      try {
        // Plus's quarterly free pass is never charged, whichever adapter is active.
        if (sku === 'passport_pass_7d' && me.data?.entitlements.passport.freePassAvailable) {
          try {
            await api.claimFreePass();
            await qc.invalidateQueries();
            return { status: 'granted', sku, changed: true };
          } catch (error) {
            return { status: 'error', sku, changed: false, error };
          }
        }
        if (impl.kind === 'store') {
          const ctx: PurchaseContext = { currentSku: PLAN_SKU[me.data?.entitlements.tier ?? 'free'] ?? null };
          const res = await impl.purchase(sku, ctx);
          if (res.status === 'granted') await settle();
          return res;
        }
        if (impl.kind === 'unavailable') return impl.purchase(sku);
        try {
          // Same route as `devAdapter`, but through the hook so caches invalidate on success.
          await devGrant.mutateAsync({ sku });
          return { status: 'granted', sku, changed: true };
        } catch (error) {
          return { status: 'error', sku, changed: false, error };
        }
      } finally {
        setBusy(false);
      }
    },
    [devGrant, impl, me.data, qc, settle],
  );

  const restore = useCallback(async (): Promise<PurchaseResult> => {
    setBusy(true);
    try {
      const res = await impl.restore();
      if (impl.kind === 'store' && res.status === 'granted') await settle();
      return res;
    } finally {
      setBusy(false);
    }
  }, [impl, settle]);

  /** Opens the store's subscription page. Resolves false when there is nothing to open (demo / web). */
  const manage = useCallback(async (): Promise<boolean> => {
    const main = myBilling.data?.subscriptions.find((s) => s.managementUrl) ?? null;
    const isStoreSub = !!main;
    if (!isStoreSub && impl.kind !== 'store') return false;
    const url = manageSubscriptionUrl(Platform.OS, {
      serverUrl: main?.managementUrl ?? null,
      androidPackage: ANDROID_PACKAGE,
      productId: main?.sku ? CATALOG[main.sku].android : null,
    });
    if (!url) return false;
    try {
      await Linking.openURL(url);
      return true;
    } catch {
      return false;
    }
  }, [impl.kind, myBilling.data]);

  /** Display price: the store's localised price when known, else the US reference price. */
  const priceOf = useCallback((sku: Sku): string => storePrices[sku] ?? formatPrice(SKU_PRICES_USD[sku], locale), [storePrices, locale]);

  return {
    purchase,
    restore,
    manage,
    priceOf,
    /** True when every shown price came from the store (otherwise show the "price shown at checkout" note). */
    storePricing: Object.keys(storePrices).length > 0,
    pending: busy || devGrant.isPending,
    /** True when this build can complete a purchase at all. */
    available: impl.kind !== 'unavailable',
    unavailableReason: impl.unavailableReason ?? null,
    /** True when the purchase is simulated and the UI must say so. */
    simulated: impl.kind === 'dev',
    kind: impl.kind,
    /** GET /me/billing: live subscriptions, renewal dates, billing issues, passes. */
    details: myBilling.data ?? null,
    skuForTier,
    tierForSku,
  };
}

/** The `billing` object the README refers to (plain, non-hook helpers). */
export const billing = {
  skuForTier,
  tierForSku,
  isSubscription,
  usdPrice,
  renewalDateFor,
  trialRenewsAt,
  skuPlan,
  adapter: billingAdapter,
  available: billingAvailable,
  simulated: isSimulatedBilling,
  unavailableReason,
  STORE_PRODUCT_IDS,
} as const;

export type Billing = typeof billing;
