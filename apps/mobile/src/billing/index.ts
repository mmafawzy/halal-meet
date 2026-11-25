/**
 * Purchase adapter.
 *
 * Everything that spends money goes through here, so the rest of the app never talks to a store SDK
 * directly. Today it can only grant entitlements through the dev route
 * (`POST /billing/dev/grant`, mock mode and dev builds), which is what makes the app demoable.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TODO(billing): RevenueCat / store IAP seam.
 *
 * 1. Add the RevenueCat SDK (`react-native-purchases`) and configure it in `src/app/_layout.tsx`
 *    with the platform API key; identify the user with the bearer token's account id so purchases
 *    survive a reinstall.
 * 2. Implement `storeAdapter` below against the SDK and return it from `resolveAdapter()` when
 *    `!DEV_BILLING`. The three calls it needs are marked `TODO(billing)` inline.
 * 3. Map the store's product identifiers to the core `Sku` union in `STORE_PRODUCT_IDS` — the
 *    identifiers are placeholders until the products exist in App Store Connect / Play Console.
 * 4. The server must validate the receipt (`POST /billing/receipts`) and return the entitlements;
 *    never trust the client. That route is not in the contract yet — see packages/core/src/api.ts.
 * 5. Regional prices come from the store, not from `SKU_PRICES_USD` (which are US anchor prices for
 *    display only). Read `product.priceString` and let the store localise it.
 * 6. Handle the store's own restore flow, and treat "user cancelled" as a normal outcome, not an error.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { PLAN_LIMITS, SKU_PRICES_USD, type PlanTier, type Sku } from '@halal-meet/core';
import { useCallback } from 'react';

import { api } from '@/api';
import { DEV_BILLING } from '@/api/index';
import { useDevGrant } from '@/api/hooks';

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

/** US anchor price, formatted for display. Regional prices come from the store — see `priceNote`. */
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

export type PurchaseStatus = 'granted' | 'cancelled' | 'unavailable' | 'error';

export interface PurchaseResult {
  status: PurchaseStatus;
  sku: Sku;
  /** True when the call changed an entitlement the caller should re-read (`useMe`, `usePassport`). */
  changed: boolean;
  error?: unknown;
}

/**
 * The seam itself. A store adapter will implement the same interface, so screens never change.
 */
export interface BillingAdapter {
  readonly kind: 'dev' | 'store';
  /** Buys (or, in dev, grants) a SKU. Resolves — never throws — so screens can always close their sheet. */
  purchase(sku: Sku): Promise<PurchaseResult>;
  /** Re-applies previously purchased entitlements (store requirement, and useful after a reinstall). */
  restore(): Promise<PurchaseResult>;
}

/**
 * Dev / mock: the server hands out the entitlement directly.
 * `api.devGrant` is a no-op grant — there is no money involved — so it is only ever selected when
 * `DEV_BILLING` is true (mock mode, or an `__DEV__` build).
 */
const devAdapter: BillingAdapter = {
  kind: 'dev',
  async purchase(sku) {
    try {
      await api.devGrant({ sku });
      return { status: 'granted', sku, changed: true };
    } catch (error) {
      return { status: 'error', sku, changed: false, error };
    }
  },
  async restore() {
    // Nothing to restore: entitlements live on the mock server and are already applied.
    return { status: 'granted', sku: 'plus_monthly', changed: false };
  },
};

/**
 * TODO(billing): the real store adapter.
 *
 * Sketch (kept as a comment rather than a stub so the type-checker does not pretend it works):
 *
 *   const storeAdapter: BillingAdapter = {
 *     kind: 'store',
 *     async purchase(sku) {
 *       const productId = STORE_PRODUCT_IDS[sku];
 *       const offerings = await Purchases.getOfferings();            // TODO(billing): real SDK
 *       const pkg = offerings.current?.availablePackages.find(p => p.product.identifier === productId);
 *       if (!pkg) return { status: 'unavailable', sku, changed: false };
 *       try {
 *         const { customerInfo } = await Purchases.purchasePackage(pkg);
 *         await api.postReceipt({ sku, receipt: customerInfo.originalAppUserId }); // TODO(billing): route
 *         return { status: 'granted', sku, changed: true };
 *       } catch (e) {
 *         if (isUserCancelled(e)) return { status: 'cancelled', sku, changed: false };
 *         throw e;
 *       }
 *     },
 *     async restore() {
 *       const info = await Purchases.restorePurchases();             // TODO(billing): real SDK
 *       await api.postReceipt({ sku: null, receipt: info.originalAppUserId });
 *       return { status: 'granted', sku: 'plus_monthly', changed: true };
 *     },
 *   };
 */
export const STORE_PRODUCT_IDS: Record<Sku, string> = {
  plus_monthly: 'app.halalmeet.plus.monthly',
  gold_monthly: 'app.halalmeet.gold.monthly',
  passport_pass_7d: 'app.halalmeet.passport.pass7d',
  passport_addon_monthly: 'app.halalmeet.passport.addon.monthly',
};

let adapter: BillingAdapter | null = null;

/** The active adapter. Falls back to the dev grant in mock mode / dev builds, exactly as before. */
export function billingAdapter(): BillingAdapter {
  // TODO(billing): return storeAdapter here once the RevenueCat integration lands.
  adapter ??= devAdapter;
  return adapter;
}

/** True when a purchase can actually be completed in this build. */
export const billingAvailable = (): boolean => DEV_BILLING || billingAdapter().kind === 'store';

/** True while purchases are simulated (the UI labels them honestly — never pretend it is real money). */
export const isSimulatedBilling = (): boolean => billingAdapter().kind === 'dev';

/**
 * The public surface used by screens. `purchase` updates the React Query caches through `useDevGrant`
 * so the whole app (Discover, Passport, Profile) reflects the new entitlements immediately.
 */
export function useBilling() {
  const devGrant = useDevGrant();

  const purchase = useCallback(
    async (sku: Sku): Promise<PurchaseResult> => {
      const impl = billingAdapter();
      if (impl.kind === 'store') return impl.purchase(sku);
      try {
        // Same route as `devAdapter`, but through the hook so caches invalidate on success.
        await devGrant.mutateAsync({ sku });
        return { status: 'granted', sku, changed: true };
      } catch (error) {
        return { status: 'error', sku, changed: false, error };
      }
    },
    [devGrant],
  );

  const restore = useCallback(async () => billingAdapter().restore(), []);

  return {
    purchase,
    restore,
    pending: devGrant.isPending,
    /** True when this build can complete a purchase at all. */
    available: billingAvailable(),
    /** True when the purchase is simulated and the UI must say so. */
    simulated: isSimulatedBilling(),
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
  STORE_PRODUCT_IDS,
} as const;

export type Billing = typeof billing;
