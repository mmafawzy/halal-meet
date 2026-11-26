import type { CountryStatus, StoreProductOverrides } from '@halal-meet/core';

export interface AppConfig {
  nodeEnv: string;
  isProduction: boolean;
  port: number;
  jwtSecret: string;
  databaseUrl: string | null;
  /** PGlite data directory; null = in-memory. */
  pgliteDir: string | null;
  countryStatusOverrides: Record<string, CountryStatus>;
  /** Store billing (RevenueCat). All optional: with nothing set, only the dev grant works (outside production). */
  billing?: BillingConfig;
}

export interface BillingConfig {
  /** REVENUECAT_WEBHOOK_SECRET — the exact Authorization header value configured in RevenueCat. */
  revenuecatWebhookSecret: string | null;
  /** REVENUECAT_API_KEY — RevenueCat secret (v1) API key, enables POST /billing/sync. */
  revenuecatApiKey: string | null;
  /** REVENUECAT_API_URL (default https://api.revenuecat.com/v1). */
  revenuecatApiUrl: string;
  /** BILLING_PRODUCT_IDS — JSON overrides of core STORE_PRODUCTS, e.g. {"plus_monthly":{"ios":"x"}}. */
  productOverrides: StoreProductOverrides;
  /** ANDROID_PACKAGE_NAME — used for the Play "manage subscription" deep link. */
  androidPackageName: string | null;
}

export function loadBillingConfig(env: NodeJS.ProcessEnv = process.env): BillingConfig {
  let productOverrides: StoreProductOverrides = {};
  if (env.BILLING_PRODUCT_IDS) {
    try {
      productOverrides = JSON.parse(env.BILLING_PRODUCT_IDS) as StoreProductOverrides;
    } catch {
      throw new Error('BILLING_PRODUCT_IDS must be JSON');
    }
  }
  return {
    revenuecatWebhookSecret: env.REVENUECAT_WEBHOOK_SECRET || null,
    revenuecatApiKey: env.REVENUECAT_API_KEY || null,
    revenuecatApiUrl: (env.REVENUECAT_API_URL || 'https://api.revenuecat.com/v1').replace(/\/+$/, ''),
    productOverrides,
    androidPackageName: env.ANDROID_PACKAGE_NAME || 'app.halalmeet.mobile',
  };
}

/** Parses "EG:open,SA:open,JO:growing". */
export function parseCountryOverrides(raw: string | undefined): Record<string, CountryStatus> {
  const out: Record<string, CountryStatus> = {};
  for (const part of (raw ?? '').split(',')) {
    const [code, status] = part.split(':').map((s) => s.trim());
    if (code && (status === 'open' || status === 'growing')) out[code.toUpperCase()] = status;
  }
  return out;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProduction = nodeEnv === 'production';
  if (isProduction && !env.JWT_SECRET) throw new Error('JWT_SECRET must be set in production');
  return {
    nodeEnv,
    isProduction,
    port: Number(env.PORT ?? 3000),
    jwtSecret: env.JWT_SECRET ?? 'halal-meet-dev-secret-change-me',
    databaseUrl: env.DATABASE_URL || null,
    pgliteDir: env.PGLITE_DIR === 'memory' ? null : (env.PGLITE_DIR ?? '.data/pglite'),
    countryStatusOverrides: parseCountryOverrides(env.COUNTRY_STATUS_OVERRIDES),
    billing: loadBillingConfig(env),
  };
}

export const CONFIG = 'CONFIG';
