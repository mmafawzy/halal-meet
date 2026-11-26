/**
 * Pure billing helpers (no React Native imports, so they are unit-tested in node).
 */
import { MANAGE_SUBSCRIPTION_URLS, normalizeProductId, type Sku, type StoreProduct } from '@halal-meet/core';

export type AdapterKind = 'dev' | 'store' | 'unavailable';
/** Why purchases cannot be made in this build. */
export type UnavailableReason = 'web' | 'not_configured';

export interface AdapterChoice {
  kind: AdapterKind;
  reason?: UnavailableReason;
}

/**
 * Which purchase path this build uses:
 * - mock mode → dev grant (the demo backend hands out entitlements);
 * - live + iOS/Android + RevenueCat key → the store (RevenueCat);
 * - live dev builds without a key (or on the web) → dev grant (the server refuses it in production);
 * - live release builds on the web → "not available on the web" (purchases happen in the mobile apps);
 * - live release builds on a phone without a key → not configured.
 */
export function chooseAdapter(o: { apiMode: 'mock' | 'live'; os: string; devBuild: boolean; hasKey: boolean }): AdapterChoice {
  if (o.apiMode === 'mock') return { kind: 'dev' };
  const native = o.os === 'ios' || o.os === 'android';
  if (native && o.hasKey) return { kind: 'store' };
  if (o.devBuild) return { kind: 'dev' };
  return { kind: 'unavailable', reason: native ? 'not_configured' : 'web' };
}

/** RevenueCat purchase errors → calm outcomes. "User cancelled" is a normal outcome, never an error. */
export function classifyPurchaseError(e: unknown): 'cancelled' | 'pending' | 'error' {
  const err = (e ?? {}) as { userCancelled?: boolean | null; code?: string | number };
  const code = err.code == null ? '' : String(err.code);
  if (err.userCancelled || code === '1') return 'cancelled'; // PURCHASE_CANCELLED_ERROR
  if (code === '20') return 'pending'; // PAYMENT_PENDING_ERROR (Ask to Buy, slow card)
  return 'error';
}

/** Store product id of a SKU on this platform. */
export function storeProductId(sku: Sku, os: string, catalog: Record<Sku, StoreProduct>): string {
  return os === 'android' ? catalog[sku].android : catalog[sku].ios;
}

/** Finds the package for a SKU: by RevenueCat package identifier, else by store product id. */
export function findPackageForSku<P extends { identifier: string; product: { identifier: string } }>(
  packages: P[],
  sku: Sku,
  os: string,
  catalog: Record<Sku, StoreProduct>,
): P | null {
  const entry = catalog[sku];
  const byPackage = packages.find((p) => p.identifier === entry.rcPackage);
  if (byPackage) return byPackage;
  const productId = normalizeProductId(storeProductId(sku, os, catalog));
  return packages.find((p) => normalizeProductId(p.product.identifier) === productId) ?? null;
}

/** Where "Manage subscription" goes: the server's link for the actual subscription, else the platform's page. */
export function manageSubscriptionUrl(os: string, opts: { serverUrl?: string | null; androidPackage?: string | null; productId?: string | null } = {}): string | null {
  if (opts.serverUrl) return opts.serverUrl;
  if (os === 'ios') return MANAGE_SUBSCRIPTION_URLS.apple;
  if (os === 'android') {
    const params: string[] = [];
    if (opts.androidPackage) params.push(`package=${encodeURIComponent(opts.androidPackage)}`);
    if (opts.productId) params.push(`sku=${encodeURIComponent(normalizeProductId(opts.productId))}`);
    return params.length ? `${MANAGE_SUBSCRIPTION_URLS.google}?${params.join('&')}` : MANAGE_SUBSCRIPTION_URLS.google;
  }
  return null;
}
