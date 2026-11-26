import { STORE_PRODUCTS, skuForProductId, storeCatalog } from '@halal-meet/core';
import { describe, expect, it } from 'vitest';

import { chooseAdapter, classifyPurchaseError, findPackageForSku, manageSubscriptionUrl, storeProductId } from './logic';

describe('billing adapter choice', () => {
  it('uses the dev grant in mock mode, whatever the platform', () => {
    expect(chooseAdapter({ apiMode: 'mock', os: 'ios', devBuild: false, hasKey: true })).toEqual({ kind: 'dev' });
    expect(chooseAdapter({ apiMode: 'mock', os: 'web', devBuild: false, hasKey: false })).toEqual({ kind: 'dev' });
  });
  it('uses RevenueCat in live mode on a phone with a key', () => {
    expect(chooseAdapter({ apiMode: 'live', os: 'android', devBuild: false, hasKey: true })).toEqual({ kind: 'store' });
  });
  it('falls back to the dev grant in live dev builds without a key or on the web', () => {
    expect(chooseAdapter({ apiMode: 'live', os: 'ios', devBuild: true, hasKey: false })).toEqual({ kind: 'dev' });
    expect(chooseAdapter({ apiMode: 'live', os: 'web', devBuild: true, hasKey: true })).toEqual({ kind: 'dev' });
  });
  it('is clearly unavailable in live release builds on the web or without keys', () => {
    expect(chooseAdapter({ apiMode: 'live', os: 'web', devBuild: false, hasKey: false })).toEqual({ kind: 'unavailable', reason: 'web' });
    expect(chooseAdapter({ apiMode: 'live', os: 'ios', devBuild: false, hasKey: false })).toEqual({ kind: 'unavailable', reason: 'not_configured' });
  });
});

describe('purchase errors', () => {
  it('treats cancellation and pending payments calmly', () => {
    expect(classifyPurchaseError({ userCancelled: true })).toBe('cancelled');
    expect(classifyPurchaseError({ code: '1' })).toBe('cancelled');
    expect(classifyPurchaseError({ code: '20' })).toBe('pending');
    expect(classifyPurchaseError({ code: '2' })).toBe('error');
    expect(classifyPurchaseError(undefined)).toBe('error');
  });
});

describe('catalogue', () => {
  it('maps store product ids (with a Play base plan) back to SKUs', () => {
    expect(skuForProductId(STORE_PRODUCTS.gold_monthly.ios)).toBe('gold_monthly');
    expect(skuForProductId('plus_monthly:monthly-base')).toBe('plus_monthly');
    expect(skuForProductId('unknown')).toBeNull();
    const custom = storeCatalog({ plus_monthly: { ios: 'com.example.plus' } });
    expect(skuForProductId('com.example.plus', custom)).toBe('plus_monthly');
    expect(storeProductId('plus_monthly', 'ios', custom)).toBe('com.example.plus');
  });
  it('finds packages by RevenueCat identifier, else by product id', () => {
    const pkgs = [
      { identifier: '$rc_monthly', product: { identifier: 'gold_monthly:base' } },
      { identifier: 'plus_monthly', product: { identifier: 'whatever' } },
    ];
    expect(findPackageForSku(pkgs, 'plus_monthly', 'android', STORE_PRODUCTS)?.identifier).toBe('plus_monthly');
    expect(findPackageForSku(pkgs, 'gold_monthly', 'android', STORE_PRODUCTS)?.identifier).toBe('$rc_monthly');
    expect(findPackageForSku(pkgs, 'passport_pass_7d', 'ios', STORE_PRODUCTS)).toBeNull();
  });
});

describe('manage subscription link', () => {
  it('prefers the server link, then the platform page; none on the web', () => {
    expect(manageSubscriptionUrl('android', { serverUrl: 'https://x' })).toBe('https://x');
    expect(manageSubscriptionUrl('ios')).toBe('https://apps.apple.com/account/subscriptions');
    expect(manageSubscriptionUrl('android', { androidPackage: 'app.halalmeet.mobile', productId: 'plus_monthly:base' })).toBe(
      'https://play.google.com/store/account/subscriptions?package=app.halalmeet.mobile&sku=plus_monthly',
    );
    expect(manageSubscriptionUrl('web')).toBeNull();
  });
});
