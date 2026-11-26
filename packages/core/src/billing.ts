/**
 * Store billing contract (RevenueCat + App Store / Google Play) shared by apps/api and apps/mobile.
 *
 * - The app buys through RevenueCat with `appUserID = accountId`, so every store event names our account.
 * - The server is the source of truth for entitlements: RevenueCat webhooks (and an optional REST re-sync)
 *   update `subscriptions` / `purchases`, and `GET /me/entitlements` reads them exactly as before.
 * - Prices are display-only on the client: the store's localised price when available, otherwise
 *   `SKU_PRICES_USD` with a "price shown at checkout" note.
 */
import type { Entitlements } from './api';
import type { Sku } from './plans';
import type { PlanTier } from './types';

/** Store product identifiers + RevenueCat package/entitlement identifiers for one SKU. */
export interface StoreProduct {
  /** App Store Connect product id. */
  ios: string;
  /** Google Play product id (subscription id; RevenueCat may append `:<base-plan>`, which is ignored). */
  android: string;
  /** RevenueCat package identifier inside the offering (custom identifiers equal to our SKU). */
  rcPackage: string;
  /** RevenueCat entitlement identifier this SKU unlocks (informational; the server maps product ids). */
  rcEntitlement: 'plus' | 'gold' | 'passport';
  kind: 'subscription' | 'one_off';
}

/**
 * The single SKU ↔ store catalogue. Product ids are placeholders until the products exist in App Store
 * Connect / Play Console — the server accepts overrides through `BILLING_PRODUCT_IDS` and the app through
 * `expo.extra.billing.products` (same shape, partial).
 */
export const STORE_PRODUCTS: Record<Sku, StoreProduct> = {
  plus_monthly: {
    ios: 'app.halalmeet.plus.monthly',
    android: 'plus_monthly',
    rcPackage: 'plus_monthly',
    rcEntitlement: 'plus',
    kind: 'subscription',
  },
  gold_monthly: {
    ios: 'app.halalmeet.gold.monthly',
    android: 'gold_monthly',
    rcPackage: 'gold_monthly',
    rcEntitlement: 'gold',
    kind: 'subscription',
  },
  passport_addon_monthly: {
    ios: 'app.halalmeet.passport.addon.monthly',
    android: 'passport_addon_monthly',
    rcPackage: 'passport_addon_monthly',
    rcEntitlement: 'passport',
    kind: 'subscription',
  },
  passport_pass_7d: {
    ios: 'app.halalmeet.passport.pass7d',
    android: 'passport_pass_7d',
    rcPackage: 'passport_pass_7d',
    rcEntitlement: 'passport',
    kind: 'one_off',
  },
};

/** The RevenueCat offering the app reads packages from (falls back to the "current" offering). */
export const RC_OFFERING_ID = 'default';

export const ALL_SKUS: Sku[] = ['plus_monthly', 'gold_monthly', 'passport_pass_7d', 'passport_addon_monthly'];

export type StoreProductOverrides = Partial<Record<Sku, Partial<StoreProduct>>>;

/** Catalogue with partial overrides applied (env / app config). */
export function storeCatalog(overrides: StoreProductOverrides = {}): Record<Sku, StoreProduct> {
  const out = {} as Record<Sku, StoreProduct>;
  for (const sku of ALL_SKUS) out[sku] = { ...STORE_PRODUCTS[sku], ...(overrides[sku] ?? {}) };
  return out;
}

/** Strips Google's `:<base-plan>` suffix. */
export function normalizeProductId(productId: string): string {
  const i = productId.indexOf(':');
  return i >= 0 ? productId.slice(0, i) : productId;
}

/** Maps a store product id (either platform, with or without base plan) to our SKU. */
export function skuForProductId(productId: string | null | undefined, catalog: Record<Sku, StoreProduct> = STORE_PRODUCTS): Sku | null {
  if (!productId) return null;
  const id = normalizeProductId(productId);
  for (const sku of ALL_SKUS) {
    const p = catalog[sku];
    if (p.ios === id || p.android === id || p.rcPackage === id || sku === id) return sku;
  }
  return null;
}

/** Subscription tier stored for a recurring SKU. */
export function subscriptionTierForSku(sku: Sku): 'plus' | 'gold' | 'passport_addon' | null {
  switch (sku) {
    case 'plus_monthly':
      return 'plus';
    case 'gold_monthly':
      return 'gold';
    case 'passport_addon_monthly':
      return 'passport_addon';
    case 'passport_pass_7d':
      return null;
  }
}

/** Days a one-off 7-day Passport pass lasts from purchase. */
export const PASSPORT_PASS_DAYS = 7;

/** Where people manage / cancel a store subscription (deep links; the app opens them, never hides them). */
export const MANAGE_SUBSCRIPTION_URLS = {
  apple: 'https://apps.apple.com/account/subscriptions',
  /** Append `?package=<android package>&sku=<product id>` to land on the exact subscription. */
  google: 'https://play.google.com/store/account/subscriptions',
} as const;

export type BillingStoreName = 'apple' | 'google' | 'stripe' | 'amazon' | 'promotional' | 'rc_billing' | 'dev' | 'test' | 'plus_quarterly' | string;

// ───────── Responses ─────────
export interface BillingSubscriptionView {
  id: string;
  /** null for plans without a self-serve SKU (Elite). */
  sku: Sku | null;
  tier: PlanTier | 'passport_addon';
  store: BillingStoreName;
  status: 'active' | 'cancelled' | 'expired' | 'refunded' | string;
  /** Access lasts until this instant; when `autoRenew` it is also the next renewal date. */
  currentPeriodEnd: string;
  autoRenew: boolean;
  /** The store reported a failed charge; access continues during the store's grace period. */
  billingIssue: boolean;
  /** Where to manage / cancel (store page), null for dev/test grants. */
  managementUrl: string | null;
}

export interface BillingPassView {
  id: string;
  sku: Sku;
  store: BillingStoreName;
  expiresAt: string;
  /** Plus quarterly free pass (no charge). */
  free: boolean;
}

/** GET /me/billing */
export interface MeBillingResponse {
  tier: PlanTier;
  /** Live subscriptions (plan and Passport add-on), newest first. */
  subscriptions: BillingSubscriptionView[];
  /** Live 7-day passes, newest first. */
  passes: BillingPassView[];
  /** Management link of the main store subscription, if any. */
  managementUrl: string | null;
  /** POST /billing/dev/grant works on this server (never in production). */
  devGrantAvailable: boolean;
  /** POST /billing/sync can re-fetch from RevenueCat (REVENUECAT_API_KEY configured). */
  storeSyncAvailable: boolean;
}

/** POST /billing/sync, POST /billing/free-pass */
export interface BillingSyncResponse {
  ok: true;
  billing: MeBillingResponse;
  entitlements: Entitlements;
}

/** POST /billing/revenuecat/webhook */
export interface RevenueCatWebhookResponse {
  ok: true;
  /** The event id was already processed (RevenueCat retries are safe). */
  duplicate: boolean;
  /** Applied | recorded only (unknown account/product, TEST events). */
  applied: boolean;
}

export const BILLING_ROUTES = {
  myBilling: 'GET /me/billing',
  billingSync: 'POST /billing/sync',
  /** Plus quarterly free 7-day pass (no store involved; works in production). */
  claimFreePass: 'POST /billing/free-pass',
  /** RevenueCat → server. Authorization header = REVENUECAT_WEBHOOK_SECRET. (public) */
  revenuecatWebhook: 'POST /billing/revenuecat/webhook',
} as const;
