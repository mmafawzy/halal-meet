import type { Sku } from '@halal-meet/core';

import type { AdapterKind, UnavailableReason } from './logic';

export type PurchaseStatus = 'granted' | 'cancelled' | 'pending' | 'unavailable' | 'error';

export interface PurchaseResult {
  status: PurchaseStatus;
  sku: Sku;
  /** True when the call changed an entitlement the caller should re-read (`useMe`, `usePassport`). */
  changed: boolean;
  error?: unknown;
}

export interface PurchaseContext {
  /** The plan SKU the member holds now (Android needs it to replace, not stack, a subscription). */
  currentSku?: Sku | null;
}

/** Localised store prices by SKU (only the SKUs the store returned). */
export type StorePrices = Partial<Record<Sku, string>>;

/**
 * The seam every purchase goes through. Screens never talk to a store SDK directly.
 * Every method resolves — never throws — so a sheet can always close calmly.
 */
export interface BillingAdapter {
  readonly kind: AdapterKind;
  readonly unavailableReason?: UnavailableReason;
  /** Signs the store SDK in/out with our account id (call after sign-in and on sign-out). */
  identify(accountId: string | null): Promise<void>;
  /** Localised prices from the store; empty when unknown (the UI falls back to USD + "price shown at checkout"). */
  prices(): Promise<StorePrices>;
  /** Buys (or, in dev, grants) a SKU. */
  purchase(sku: Sku, ctx?: PurchaseContext): Promise<PurchaseResult>;
  /** Re-applies previously purchased entitlements (store requirement, and useful after a reinstall). */
  restore(): Promise<PurchaseResult>;
  /** Subscribes to store-side changes (renewal, refund, purchase on another device). Returns an unsubscribe. */
  onChange(listener: () => void): () => void;
}
