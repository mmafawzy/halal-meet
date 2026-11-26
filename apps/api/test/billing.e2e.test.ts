import 'reflect-metadata';
import { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppModule } from '../src/app.module';
import { CONFIG, loadConfig, type AppConfig } from '../src/config';
import { DB, openDatabase, type DbHandle } from '../src/db/client';
import * as t from '../src/db/schema';
import { createMember, login, truncateAll, type TestContext } from './helpers';

const SECRET = 'rc-webhook-test-secret';
const DAY = 86_400_000;

let ctx: TestContext;
let config: AppConfig;
let counter = 0;

/** Same as createTestApp, but with a mutable billing config (webhook secret, production toggle, API key). */
async function createBillingApp(): Promise<TestContext> {
  process.env.PGLITE_DIR = 'memory';
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';
  config = loadConfig({ ...process.env, REVENUECAT_WEBHOOK_SECRET: SECRET });
  const handle: DbHandle = await openDatabase({ url: null, dataDir: null });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(handle.db)
    .overrideProvider(CONFIG)
    .useValue(config)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
  return {
    db: handle.db,
    http: request(app.getHttpServer() as App),
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

beforeAll(async () => {
  ctx = await createBillingApp();
});
afterAll(async () => {
  await ctx.close();
});
beforeEach(async () => {
  await truncateAll(ctx.db);
  config.isProduction = false;
  config.billing!.revenuecatApiKey = null;
});
afterEach(() => {
  vi.restoreAllMocks();
});

interface EventInput {
  type: string;
  app_user_id: string;
  product_id: string;
  [k: string]: unknown;
}

function rcEvent(e: EventInput) {
  counter += 1;
  return {
    api_version: '1.0',
    event: {
      id: `evt_${counter}_${Math.random().toString(36).slice(2)}`,
      store: 'APP_STORE',
      environment: 'SANDBOX',
      original_transaction_id: 'otx_1',
      transaction_id: `tx_${counter}`,
      purchased_at_ms: Date.now(),
      event_timestamp_ms: Date.now(),
      ...e,
    },
  };
}

const post = (body: unknown, auth: string | null = SECRET) => {
  const r = ctx.http.post('/billing/revenuecat/webhook');
  if (auth !== null) r.set('Authorization', auth);
  return r.send(body as object);
};

async function member() {
  const m = await createMember(ctx, { gender: 'male' });
  const token = await login(ctx, m.phone);
  const ent = async () => (await ctx.http.get('/me/entitlements').set('Authorization', `Bearer ${token}`).expect(200)).body;
  const billing = async () => (await ctx.http.get('/me/billing').set('Authorization', `Bearer ${token}`).expect(200)).body;
  return { ...m, token, ent, billing };
}

const inDays = (d: number) => Date.now() + d * DAY;

describe('RevenueCat webhook: auth + idempotency', () => {
  it('rejects a missing or wrong Authorization header and accepts the secret (with or without Bearer)', async () => {
    const m = await member();
    const body = rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(30) });
    await post(body, null).expect(401);
    await post(body, 'wrong').expect(401);
    await post(body, `Bearer wrong`).expect(401);
    expect((await m.ent()).tier).toBe('free');
    const ok = await post(body, `Bearer ${SECRET}`).expect(200);
    expect(ok.body).toEqual({ ok: true, duplicate: false, applied: true });
    expect((await m.ent()).tier).toBe('plus');
  });

  it('answers 503 when no secret is configured', async () => {
    const saved = config.billing!.revenuecatWebhookSecret;
    config.billing!.revenuecatWebhookSecret = null;
    try {
      await post({ event: { id: 'x', type: 'TEST' } }, 'anything').expect(503);
    } finally {
      config.billing!.revenuecatWebhookSecret = saved;
    }
  });

  it('rejects malformed bodies', async () => {
    await post({ nope: true }).expect(400);
  });

  it('processes each event id once', async () => {
    const m = await member();
    const body = rcEvent({ type: 'NON_RENEWING_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.passport.pass7d' });
    expect((await post(body).expect(200)).body.duplicate).toBe(false);
    expect((await post(body).expect(200)).body).toEqual({ ok: true, duplicate: true, applied: false });
    const rows = await ctx.db.select().from(t.purchases).where(eq(t.purchases.accountId, m.id));
    expect(rows).toHaveLength(1);
    const events = await ctx.db.select().from(t.billingEvents).where(eq(t.billingEvents.id, body.event.id));
    expect(events).toHaveLength(1);
    expect(events[0]!.accountId).toBe(m.id);
    expect(events[0]!.store).toBe('app_store');
  });

  it('records but does not apply events for unknown users, unknown products and TEST', async () => {
    const m = await member();
    expect((await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc', product_id: 'app.halalmeet.plus.monthly' })).expect(200)).body.applied).toBe(false);
    expect((await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: m.id, product_id: 'some.other.product' })).expect(200)).body.applied).toBe(false);
    expect((await post(rcEvent({ type: 'TEST', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly' })).expect(200)).body.applied).toBe(false);
    expect((await m.ent()).tier).toBe('free');
    expect(await ctx.db.select().from(t.billingEvents)).toHaveLength(3);
  });

  it('resolves the account from aliases when app_user_id is anonymous', async () => {
    const m = await member();
    await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: '$RCAnonymousID:abc', aliases: ['$RCAnonymousID:abc', m.id], product_id: 'app.halalmeet.gold.monthly', expiration_at_ms: inDays(30) })).expect(200);
    expect((await m.ent()).tier).toBe('gold');
  });
});

describe('RevenueCat webhook: subscription lifecycle', () => {
  it('INITIAL_PURCHASE → RENEWAL → CANCELLATION → UNCANCELLATION → EXPIRATION', async () => {
    const m = await member();
    expect((await m.ent()).tier).toBe('free');

    await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(30), period_type: 'TRIAL' })).expect(200);
    expect((await m.ent()).tier).toBe('plus');
    let b = await m.billing();
    expect(b.subscriptions).toHaveLength(1);
    expect(b.subscriptions[0]).toMatchObject({ sku: 'plus_monthly', tier: 'plus', store: 'apple', autoRenew: true, billingIssue: false });
    expect(b.managementUrl).toBe('https://apps.apple.com/account/subscriptions');

    const renewedUntil = inDays(60);
    await post(rcEvent({ type: 'RENEWAL', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: renewedUntil })).expect(200);
    b = await m.billing();
    expect(new Date(b.subscriptions[0].currentPeriodEnd).getTime()).toBe(renewedUntil);
    expect(await ctx.db.select().from(t.subscriptions).where(eq(t.subscriptions.accountId, m.id))).toHaveLength(1);

    // Turning auto-renew off keeps access until the end of the paid period.
    await post(rcEvent({ type: 'CANCELLATION', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: renewedUntil, cancel_reason: 'UNSUBSCRIBE' })).expect(200);
    expect((await m.ent()).tier).toBe('plus');
    expect((await m.billing()).subscriptions[0].autoRenew).toBe(false);

    await post(rcEvent({ type: 'UNCANCELLATION', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: renewedUntil })).expect(200);
    expect((await m.billing()).subscriptions[0].autoRenew).toBe(true);

    // A stale EXPIRATION (for an earlier period) is ignored…
    await post(rcEvent({ type: 'EXPIRATION', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(30) })).expect(200);
    expect((await m.ent()).tier).toBe('plus');
    // …the real one ends access.
    await post(rcEvent({ type: 'EXPIRATION', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: renewedUntil, expiration_reason: 'UNSUBSCRIBE' })).expect(200);
    expect((await m.ent()).tier).toBe('free');
    b = await m.billing();
    expect(b.subscriptions).toHaveLength(0);
    expect(b.managementUrl).toBeNull();

    const notes = await ctx.db.select().from(t.notifications).where(and(eq(t.notifications.accountId, m.id), eq(t.notifications.kind, 'billing')));
    expect(notes.map((n) => (n.payload as { event: string }).event).sort()).toEqual(['expired', 'purchased', 'renewal_off', 'renewed']);
  });

  it('PRODUCT_CHANGE upgrades immediately; a downgrade applies at the next renewal', async () => {
    const m = await member();
    await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(30) })).expect(200);
    await post(rcEvent({ type: 'PRODUCT_CHANGE', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', new_product_id: 'app.halalmeet.gold.monthly', expiration_at_ms: inDays(30) })).expect(200);
    expect((await m.ent()).tier).toBe('gold');
    expect((await m.ent()).passport.capacity).toBe(3);

    const down = await post(rcEvent({ type: 'PRODUCT_CHANGE', app_user_id: m.id, product_id: 'app.halalmeet.gold.monthly', new_product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(30) })).expect(200);
    expect(down.body.applied).toBe(false);
    expect((await m.ent()).tier).toBe('gold');
    await post(rcEvent({ type: 'RENEWAL', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(60) })).expect(200);
    expect((await m.ent()).tier).toBe('plus');
    expect(await ctx.db.select().from(t.subscriptions).where(eq(t.subscriptions.accountId, m.id))).toHaveLength(1);
  });

  it('a refund (CANCELLATION with CUSTOMER_SUPPORT) ends access now', async () => {
    const m = await member();
    await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.gold.monthly', expiration_at_ms: inDays(30) })).expect(200);
    expect((await m.ent()).tier).toBe('gold');
    await post(rcEvent({ type: 'CANCELLATION', app_user_id: m.id, product_id: 'app.halalmeet.gold.monthly', expiration_at_ms: Date.now(), cancel_reason: 'CUSTOMER_SUPPORT' })).expect(200);
    expect((await m.ent()).tier).toBe('free');
    const [row] = await ctx.db.select().from(t.subscriptions).where(eq(t.subscriptions.accountId, m.id));
    expect(row!.status).toBe('refunded');
  });

  it('BILLING_ISSUE keeps access through the grace period, flags it and notifies', async () => {
    const m = await member();
    await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(1) })).expect(200);
    const grace = inDays(16);
    await post(rcEvent({ type: 'BILLING_ISSUE', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(1), grace_period_expiration_at_ms: grace })).expect(200);
    expect((await m.ent()).tier).toBe('plus');
    const b = await m.billing();
    expect(b.subscriptions[0].billingIssue).toBe(true);
    expect(new Date(b.subscriptions[0].currentPeriodEnd).getTime()).toBe(grace);
    const notes = await ctx.db.select().from(t.notifications).where(and(eq(t.notifications.accountId, m.id), eq(t.notifications.kind, 'billing')));
    const issue = notes.find((n) => (n.payload as { event: string }).event === 'billing_issue');
    expect(issue?.payload).toMatchObject({ sku: 'plus_monthly', store: 'apple', gracePeriodEndsAt: new Date(grace).toISOString() });

    // A successful retry clears the flag.
    await post(rcEvent({ type: 'RENEWAL', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(31) })).expect(200);
    expect((await m.billing()).subscriptions[0].billingIssue).toBe(false);
  });

  it('SUBSCRIPTION_PAUSED turns renewal off (Play) and keeps access until the period ends', async () => {
    const m = await member();
    await post(rcEvent({ type: 'INITIAL_PURCHASE', store: 'PLAY_STORE', original_transaction_id: 'GPA.1', app_user_id: m.id, product_id: 'plus_monthly:monthly', expiration_at_ms: inDays(10) })).expect(200);
    await post(rcEvent({ type: 'SUBSCRIPTION_PAUSED', store: 'PLAY_STORE', original_transaction_id: 'GPA.1', app_user_id: m.id, product_id: 'plus_monthly:monthly', expiration_at_ms: inDays(10) })).expect(200);
    const b = await m.billing();
    expect((await m.ent()).tier).toBe('plus');
    expect(b.subscriptions[0]).toMatchObject({ store: 'google', autoRenew: false });
    expect(b.subscriptions[0].managementUrl).toBe('https://play.google.com/store/account/subscriptions?package=app.halalmeet.mobile&sku=plus_monthly');
  });

  it('Passport add-on subscription gives capacity 1 and is independent of the plan', async () => {
    const m = await member();
    await post(rcEvent({ type: 'INITIAL_PURCHASE', original_transaction_id: 'otx_addon', app_user_id: m.id, product_id: 'app.halalmeet.passport.addon.monthly', expiration_at_ms: inDays(30) })).expect(200);
    let e = await m.ent();
    expect(e.tier).toBe('free');
    expect(e.passport).toMatchObject({ capacity: 1, source: 'addon' });
    await post(rcEvent({ type: 'INITIAL_PURCHASE', original_transaction_id: 'otx_plan', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(30) })).expect(200);
    e = await m.ent();
    expect(e.tier).toBe('plus');
    expect(e.passport.source).toBe('addon');
    await post(rcEvent({ type: 'EXPIRATION', original_transaction_id: 'otx_addon', app_user_id: m.id, product_id: 'app.halalmeet.passport.addon.monthly', expiration_at_ms: inDays(30) })).expect(200);
    e = await m.ent();
    expect(e.tier).toBe('plus');
    expect(e.passport).toMatchObject({ capacity: 0, source: 'none' });
  });

  it('TRANSFER moves store purchases to the account they were restored on', async () => {
    const a = await member();
    const b = await member();
    await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: a.id, product_id: 'app.halalmeet.gold.monthly', expiration_at_ms: inDays(30) })).expect(200);
    expect((await a.ent()).tier).toBe('gold');
    await post({ event: { id: 'evt_transfer_1', type: 'TRANSFER', store: 'APP_STORE', transferred_from: [a.id], transferred_to: [b.id] } }).expect(200);
    expect((await a.ent()).tier).toBe('free');
    expect((await b.ent()).tier).toBe('gold');
  });
});

describe('RevenueCat webhook: 7-day Passport pass', () => {
  it('NON_RENEWING_PURCHASE grants capacity for 7 days; a refund revokes it', async () => {
    const m = await member();
    expect((await m.ent()).passport.capacity).toBe(0);
    await post(rcEvent({ type: 'NON_RENEWING_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.passport.pass7d', transaction_id: 'pass_tx_1', price_in_purchased_currency: 4.99, currency: 'USD' })).expect(200);
    const e = await m.ent();
    expect(e.passport).toMatchObject({ capacity: 1, source: 'pass' });
    const expires = new Date(e.passport.passExpiresAt).getTime();
    expect(Math.abs(expires - inDays(7))).toBeLessThan(60_000);
    const b = await m.billing();
    expect(b.passes).toHaveLength(1);
    expect(b.passes[0]).toMatchObject({ sku: 'passport_pass_7d', store: 'apple', free: false });
    const [row] = await ctx.db.select().from(t.purchases).where(eq(t.purchases.accountId, m.id));
    expect(row).toMatchObject({ amountMinor: 499, currency: 'USD', storeRef: 'pass_tx_1' });

    await post(rcEvent({ type: 'CANCELLATION', app_user_id: m.id, product_id: 'app.halalmeet.passport.pass7d', transaction_id: 'pass_tx_1', cancel_reason: 'CUSTOMER_SUPPORT' })).expect(200);
    expect((await m.ent()).passport).toMatchObject({ capacity: 0, source: 'none' });
    const [revoked] = await ctx.db.select().from(t.purchases).where(eq(t.purchases.accountId, m.id));
    expect(revoked!.status).toBe('revoked');
  });

  it('an expired pass no longer counts', async () => {
    const m = await member();
    await post(rcEvent({ type: 'NON_RENEWING_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.passport.pass7d', purchased_at_ms: Date.now() - 8 * DAY })).expect(200);
    expect((await m.ent()).passport.capacity).toBe(0);
    expect((await m.billing()).passes).toHaveLength(0);
  });
});

describe('GET /me/billing, POST /billing/sync, POST /billing/free-pass, dev grant', () => {
  it('reports dev/test availability and dev grants without a management link', async () => {
    const m = await member();
    const auth = { Authorization: `Bearer ${m.token}` };
    await ctx.http.post('/billing/dev/grant').set(auth).send({ sku: 'gold_monthly' }).expect(200);
    const b = await m.billing();
    expect(b).toMatchObject({ tier: 'gold', devGrantAvailable: true, storeSyncAvailable: false, managementUrl: null });
    expect(b.subscriptions[0]).toMatchObject({ store: 'dev', sku: 'gold_monthly', managementUrl: null });
  });

  it('blocks the dev grant in production', async () => {
    const m = await member();
    config.isProduction = true;
    const res = await ctx.http.post('/billing/dev/grant').set('Authorization', `Bearer ${m.token}`).send({ sku: 'plus_monthly' }).expect(403);
    expect(res.body.error).toBe('dev_grant_disabled');
    expect((await m.ent()).tier).toBe('free');
    expect((await m.billing()).devGrantAvailable).toBe(false);
  });

  it('sync answers 501 without REVENUECAT_API_KEY', async () => {
    const m = await member();
    const res = await ctx.http.post('/billing/sync').set('Authorization', `Bearer ${m.token}`).expect(501);
    expect(res.body.error).toBe('store_sync_unavailable');
  });

  it('sync reconciles from the RevenueCat subscriber when configured', async () => {
    const m = await member();
    config.billing!.revenuecatApiKey = 'sk_test';
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
      new Response(
        JSON.stringify({
          subscriber: {
            subscriptions: {
              'app.halalmeet.gold.monthly': { expires_date: new Date(inDays(20)).toISOString(), store: 'app_store', unsubscribe_detected_at: null, refunded_at: null, store_transaction_id: '1000' },
            },
            non_subscriptions: {
              'app.halalmeet.passport.pass7d': [{ id: 'np_1', purchase_date: new Date().toISOString(), store: 'app_store', store_transaction_id: '2000' }],
            },
          },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );
    const res = await ctx.http.post('/billing/sync').set('Authorization', `Bearer ${m.token}`).expect(200);
    expect(fetchSpy).toHaveBeenCalledWith(`https://api.revenuecat.com/v1/subscribers/${m.id}`, expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer sk_test' }) }));
    expect(res.body.entitlements.tier).toBe('gold');
    expect(res.body.billing.subscriptions[0]).toMatchObject({ sku: 'gold_monthly', store: 'apple', autoRenew: true });
    expect(res.body.billing.passes).toHaveLength(1);
    // Idempotent: a second sync does not duplicate rows.
    await ctx.http.post('/billing/sync').set('Authorization', `Bearer ${m.token}`).expect(200);
    expect(await ctx.db.select().from(t.subscriptions).where(eq(t.subscriptions.accountId, m.id))).toHaveLength(1);
    expect(await ctx.db.select().from(t.purchases).where(eq(t.purchases.accountId, m.id))).toHaveLength(1);
    expect((await m.ent()).passport.capacity).toBe(3); // Gold includes 3 destinations
  });

  it('sync surfaces RevenueCat errors as 502', async () => {
    const m = await member();
    config.billing!.revenuecatApiKey = 'sk_test';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('nope', { status: 500 }));
    const res = await ctx.http.post('/billing/sync').set('Authorization', `Bearer ${m.token}`).expect(502);
    expect(res.body.error).toBe('store_sync_failed');
  });

  it('Plus members claim the quarterly free pass once (works in production)', async () => {
    const m = await member();
    const auth = { Authorization: `Bearer ${m.token}` };
    await ctx.http.post('/billing/free-pass').set(auth).expect(403);
    await post(rcEvent({ type: 'INITIAL_PURCHASE', app_user_id: m.id, product_id: 'app.halalmeet.plus.monthly', expiration_at_ms: inDays(30) })).expect(200);
    config.isProduction = true;
    const res = await ctx.http.post('/billing/free-pass').set(auth).expect(200);
    expect(res.body.entitlements.passport).toMatchObject({ capacity: 1, source: 'pass', freePassAvailable: false });
    expect(res.body.billing.passes[0]).toMatchObject({ free: true });
    await ctx.http.post('/billing/free-pass').set(auth).expect(403);
  });
});
