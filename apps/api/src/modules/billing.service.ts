import { createHash, timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNotNull, notInArray } from 'drizzle-orm';
import {
  MANAGE_SUBSCRIPTION_URLS,
  PASSPORT_PASS_DAYS,
  normalizeProductId,
  skuForProductId,
  storeCatalog,
  subscriptionTierForSku,
  type BillingPassView,
  type BillingSubscriptionView,
  type BillingSyncResponse,
  type MeBillingResponse,
  type PlanTier,
  type RevenueCatWebhookResponse,
  type Sku,
  type StoreProduct,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { CONFIG, loadBillingConfig, type AppConfig, type BillingConfig } from '../config';
import { uuidv7 } from '../common/ids';
import { addDays } from '../common/time';
import { EntitlementsService, PASS_MONTH_DAYS } from './entitlements';
import { NotificationsService } from './notifications.service';

type SubRow = typeof t.subscriptions.$inferSelect;
type SubTier = 'plus' | 'gold' | 'elite' | 'passport_addon';

/** Stores whose rows came from a real store (and may move on TRANSFER). */
const NON_STORE = ['dev', 'test', 'plus_quarterly'];
const PLAN_FAMILY: SubTier[] = ['plus', 'gold', 'elite'];
const RANK: Record<string, number> = { plus: 1, gold: 2, elite: 3 };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Tolerance when comparing store timestamps (out-of-order deliveries). */
const SKEW_MS = 60_000;

/** The parts of a RevenueCat webhook event we read (https://www.revenuecat.com/docs/integrations/webhooks/event-types-and-fields). */
export interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id?: string | null;
  original_app_user_id?: string | null;
  aliases?: string[] | null;
  product_id?: string | null;
  new_product_id?: string | null;
  period_type?: string | null;
  purchased_at_ms?: number | null;
  expiration_at_ms?: number | null;
  event_timestamp_ms?: number | null;
  grace_period_expiration_at_ms?: number | null;
  store?: string | null;
  environment?: string | null;
  transaction_id?: string | null;
  original_transaction_id?: string | null;
  cancel_reason?: string | null;
  expiration_reason?: string | null;
  price_in_purchased_currency?: number | null;
  currency?: string | null;
  transferred_from?: string[] | null;
  transferred_to?: string[] | null;
}

interface PendingNotice {
  accountId: string;
  payload: Record<string, unknown>;
}

/** RevenueCat store enum → our `subscriptions.store` / `purchases.store` value. */
export function storeName(rcStore: string | null | undefined): string {
  switch (rcStore) {
    case 'APP_STORE':
    case 'MAC_APP_STORE':
      return 'apple';
    case 'PLAY_STORE':
      return 'google';
    case 'STRIPE':
      return 'stripe';
    case 'AMAZON':
      return 'amazon';
    case 'PROMOTIONAL':
      return 'promotional';
    case 'RC_BILLING':
      return 'rc_billing';
    default:
      return (rcStore ?? 'unknown').toLowerCase();
  }
}

const ms = (v: number | null | undefined): Date | null => (typeof v === 'number' && Number.isFinite(v) ? new Date(v) : null);
const iso = (v: string | null | undefined): Date | null => {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};
const digest = (s: string) => createHash('sha256').update(s).digest();

/**
 * Store billing: RevenueCat webhooks → `subscriptions` / `purchases`, GET /me/billing, POST /billing/sync.
 * Entitlements are still computed by `EntitlementsService` from those rows, so every existing caller keeps working.
 */
@Injectable()
export class BillingService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {}

  private get cfg(): BillingConfig {
    return this.config.billing ?? loadBillingConfig({});
  }

  private catalog(): Record<Sku, StoreProduct> {
    return storeCatalog(this.cfg.productOverrides);
  }

  // ───────── Webhook ─────────

  /** RevenueCat sends the configured value verbatim in `Authorization`; accept it with or without `Bearer `. */
  verifyWebhookAuth(header: string | string[] | undefined): void {
    const secret = this.cfg.revenuecatWebhookSecret;
    if (!secret) throw new ServiceUnavailableException({ error: 'webhook_not_configured', message: 'Set REVENUECAT_WEBHOOK_SECRET.' });
    const raw = (Array.isArray(header) ? header[0] : header)?.trim() ?? '';
    const want = digest(secret);
    const ok = [raw, raw.startsWith('Bearer ') ? raw.slice(7).trim() : null]
      .filter((v): v is string => v !== null && v.length > 0)
      .some((v) => timingSafeEqual(digest(v), want));
    if (!ok) throw new UnauthorizedException({ error: 'unauthorized' });
  }

  async handleRevenueCatWebhook(body: unknown, now = new Date()): Promise<RevenueCatWebhookResponse> {
    const event = (body as { event?: RevenueCatEvent } | null)?.event;
    if (!event || typeof event.id !== 'string' || !event.id || typeof event.type !== 'string') {
      throw new BadRequestException({ error: 'invalid_event' });
    }
    const notices: PendingNotice[] = [];
    const result = await this.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      const accountId = await this.resolveAccount(tx, [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])]);
      const inserted = await tx
        .insert(t.billingEvents)
        .values({
          id: event.id,
          accountId,
          store: (event.store ?? 'unknown').toLowerCase(),
          type: event.type,
          payload: body as Record<string, unknown>,
          receivedAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: t.billingEvents.id });
      if (inserted.length === 0) return { ok: true as const, duplicate: true, applied: false };
      const applied = await this.applyEvent(tx, event, accountId, now, notices);
      return { ok: true as const, duplicate: false, applied };
    });
    for (const n of notices) await this.notifications.notify(n.accountId, 'billing', n.payload);
    return result;
  }

  private async resolveAccount(tx: Db, candidates: Array<string | null | undefined>): Promise<string | null> {
    const ids = [...new Set(candidates.filter((c): c is string => !!c && UUID_RE.test(c)))];
    if (ids.length === 0) return null;
    const rows = await tx.select({ id: t.accounts.id }).from(t.accounts).where(inArray(t.accounts.id, ids));
    const known = new Set(rows.map((r) => r.id));
    return ids.find((id) => known.has(id)) ?? null;
  }

  private async applyEvent(tx: Db, e: RevenueCatEvent, accountId: string | null, now: Date, notices: PendingNotice[]): Promise<boolean> {
    if (e.type === 'TRANSFER') return this.applyTransfer(tx, e);
    if (!accountId) return false;
    const sku = skuForProductId(e.product_id, this.catalog());
    if (!sku) return false;
    const store = storeName(e.store);
    const notify = (payload: Record<string, unknown>) => notices.push({ accountId, payload: { sku, store, ...payload } });

    if (sku === 'passport_pass_7d') return this.applyPassEvent(tx, e, accountId, store, now, notify);

    const tier = subscriptionTierForSku(sku)!;
    const storeRef = e.original_transaction_id ?? e.transaction_id ?? null;
    const expiration = ms(e.expiration_at_ms);
    const existing = await this.findSubRow(tx, accountId, tier, store, storeRef);

    switch (e.type) {
      case 'INITIAL_PURCHASE':
      case 'RENEWAL':
      case 'UNCANCELLATION':
      case 'SUBSCRIPTION_EXTENDED':
      case 'TEMPORARY_ENTITLEMENT_GRANT':
      case 'REFUND_REVERSED':
      case 'NON_RENEWING_PURCHASE': {
        const end = expiration ?? existing?.currentPeriodEnd ?? addDays(now, PASS_MONTH_DAYS);
        const autoRenew = e.type !== 'NON_RENEWING_PURCHASE';
        await this.upsertSub(tx, existing, { accountId, tier, store, storeRef, status: 'active', currentPeriodEnd: end, autoRenew });
        if (e.type === 'RENEWAL') notify({ event: 'renewed', until: end.toISOString() });
        if (e.type === 'INITIAL_PURCHASE') notify({ event: 'purchased', until: end.toISOString(), trial: e.period_type === 'TRIAL' });
        return true;
      }
      case 'PRODUCT_CHANGE': {
        // Upgrades take effect immediately; downgrades/crossgrades apply at the next RENEWAL (which carries the new product).
        const next = skuForProductId(e.new_product_id, this.catalog());
        const nextTier = next ? subscriptionTierForSku(next) : null;
        const currentTier = existing?.tier ?? tier;
        if (!next || !nextTier || !RANK[nextTier] || !RANK[currentTier] || RANK[nextTier] <= RANK[currentTier]) return false;
        await this.upsertSub(tx, existing, {
          accountId,
          tier: nextTier,
          store,
          storeRef,
          status: 'active',
          currentPeriodEnd: expiration ?? existing?.currentPeriodEnd ?? addDays(now, PASS_MONTH_DAYS),
          autoRenew: true,
        });
        return true;
      }
      case 'CANCELLATION': {
        if (e.cancel_reason === 'CUSTOMER_SUPPORT') {
          // Refund: access ends now.
          await this.upsertSub(tx, existing, { accountId, tier, store, storeRef, status: 'refunded', currentPeriodEnd: now, autoRenew: false });
          notify({ event: 'refunded' });
          return true;
        }
        const end = expiration ?? existing?.currentPeriodEnd ?? now;
        await this.upsertSub(tx, existing, { accountId, tier, store, storeRef, status: end > now ? 'active' : 'expired', currentPeriodEnd: end, autoRenew: false });
        // A failed charge already produced a billing-issue notice.
        if (e.cancel_reason !== 'BILLING_ERROR') notify({ event: 'renewal_off', until: end.toISOString() });
        return true;
      }
      case 'EXPIRATION': {
        const end = expiration ?? now;
        // Stale delivery: a later renewal was already applied.
        if (existing && existing.status === 'active' && existing.currentPeriodEnd.getTime() > end.getTime() + SKEW_MS) return false;
        await this.upsertSub(tx, existing, { accountId, tier, store, storeRef, status: 'expired', currentPeriodEnd: end < now ? end : now, autoRenew: false });
        notify({ event: 'expired', reason: e.expiration_reason ?? null });
        return true;
      }
      case 'BILLING_ISSUE': {
        const grace = ms(e.grace_period_expiration_at_ms);
        if (existing) {
          const end = grace && grace > existing.currentPeriodEnd ? grace : existing.currentPeriodEnd;
          await this.upsertSub(tx, existing, { accountId, tier: existing.tier as SubTier, store, storeRef, status: existing.status, currentPeriodEnd: end, autoRenew: existing.autoRenew });
        } else if (grace && grace > now) {
          await this.upsertSub(tx, null, { accountId, tier, store, storeRef, status: 'active', currentPeriodEnd: grace, autoRenew: true });
        }
        notify({ event: 'billing_issue', gracePeriodEndsAt: grace?.toISOString() ?? null });
        return true;
      }
      case 'SUBSCRIPTION_PAUSED': {
        // Android: the pause starts at the end of the period; an EXPIRATION follows then.
        await this.upsertSub(tx, existing, {
          accountId,
          tier,
          store,
          storeRef,
          status: existing?.status ?? 'active',
          currentPeriodEnd: expiration ?? existing?.currentPeriodEnd ?? now,
          autoRenew: false,
        });
        notify({ event: 'paused', until: (expiration ?? existing?.currentPeriodEnd ?? now).toISOString() });
        return true;
      }
      default:
        // TEST, INVOICE_ISSUANCE, VIRTUAL_CURRENCY_TRANSACTION, … are recorded only.
        return false;
    }
  }

  private async applyPassEvent(
    tx: Db,
    e: RevenueCatEvent,
    accountId: string,
    store: string,
    now: Date,
    notify: (p: Record<string, unknown>) => void,
  ): Promise<boolean> {
    const ref = e.transaction_id ?? e.original_transaction_id ?? null;
    const byRef = ref
      ? await tx.select().from(t.purchases).where(and(eq(t.purchases.accountId, accountId), eq(t.purchases.storeRef, ref))).limit(1)
      : [];
    const row = byRef[0] ?? null;
    switch (e.type) {
      case 'NON_RENEWING_PURCHASE':
      case 'INITIAL_PURCHASE': {
        if (row) return false;
        const purchasedAt = ms(e.purchased_at_ms) ?? now;
        const expiresAt = ms(e.expiration_at_ms) ?? addDays(purchasedAt, PASSPORT_PASS_DAYS);
        await tx.insert(t.purchases).values({
          id: uuidv7(),
          accountId,
          sku: 'passport_pass_7d',
          store,
          storeRef: ref,
          amountMinor: typeof e.price_in_purchased_currency === 'number' ? Math.round(e.price_in_purchased_currency * 100) : null,
          currency: e.currency ?? null,
          status: 'fulfilled',
          fulfilledAt: purchasedAt,
          expiresAt,
        });
        notify({ event: 'purchased', until: expiresAt.toISOString() });
        return true;
      }
      case 'CANCELLATION': {
        // One-off products are only "cancelled" by a refund.
        const target =
          row ??
          (
            await tx
              .select()
              .from(t.purchases)
              .where(and(eq(t.purchases.accountId, accountId), eq(t.purchases.store, store), eq(t.purchases.sku, 'passport_pass_7d'), eq(t.purchases.status, 'fulfilled')))
              .orderBy(desc(t.purchases.createdAt))
              .limit(1)
          )[0];
        if (!target) return false;
        await tx.update(t.purchases).set({ status: 'revoked', expiresAt: now }).where(eq(t.purchases.id, target.id));
        notify({ event: 'refunded' });
        return true;
      }
      case 'REFUND_REVERSED': {
        if (!row) return false;
        const expiresAt = addDays(row.fulfilledAt ?? now, PASSPORT_PASS_DAYS);
        await tx.update(t.purchases).set({ status: 'fulfilled', expiresAt }).where(eq(t.purchases.id, row.id));
        return true;
      }
      default:
        return false;
    }
  }

  /** Moves store-backed rows to the account the purchases were transferred to (restore on another account). */
  private async applyTransfer(tx: Db, e: RevenueCatEvent): Promise<boolean> {
    const to = await this.resolveAccount(tx, e.transferred_to ?? []);
    const fromIds = (e.transferred_from ?? []).filter((id) => UUID_RE.test(id) && id !== to);
    if (!to || fromIds.length === 0) return false;
    await tx
      .update(t.subscriptions)
      .set({ accountId: to })
      .where(and(inArray(t.subscriptions.accountId, fromIds), notInArray(t.subscriptions.store, NON_STORE)));
    await tx
      .update(t.purchases)
      .set({ accountId: to })
      .where(and(inArray(t.purchases.accountId, fromIds), notInArray(t.purchases.store, NON_STORE)));
    return true;
  }

  /** The row an event refers to: same store transaction, else the newest store row of the same family. */
  private async findSubRow(tx: Db, accountId: string, tier: SubTier, store: string, storeRef: string | null): Promise<SubRow | null> {
    if (storeRef) {
      const [row] = await tx
        .select()
        .from(t.subscriptions)
        .where(and(eq(t.subscriptions.accountId, accountId), eq(t.subscriptions.storeRef, storeRef)))
        .limit(1);
      if (row) return row;
    }
    const family = tier === 'passport_addon' ? ['passport_addon'] : PLAN_FAMILY;
    const [row] = await tx
      .select()
      .from(t.subscriptions)
      .where(
        and(
          eq(t.subscriptions.accountId, accountId),
          eq(t.subscriptions.store, store),
          inArray(t.subscriptions.tier, family),
          isNotNull(t.subscriptions.storeRef),
        ),
      )
      .orderBy(desc(t.subscriptions.createdAt))
      .limit(1);
    return row ?? null;
  }

  private async upsertSub(
    tx: Db,
    existing: SubRow | null,
    v: { accountId: string; tier: SubTier; store: string; storeRef: string | null; status: string; currentPeriodEnd: Date; autoRenew: boolean },
  ): Promise<void> {
    if (existing) {
      await tx
        .update(t.subscriptions)
        .set({
          tier: v.tier,
          store: v.store,
          storeRef: v.storeRef ?? existing.storeRef,
          status: v.status,
          currentPeriodEnd: v.currentPeriodEnd,
          autoRenew: v.autoRenew,
        })
        .where(eq(t.subscriptions.id, existing.id));
      return;
    }
    await tx.insert(t.subscriptions).values({
      id: uuidv7(),
      accountId: v.accountId,
      tier: v.tier,
      store: v.store,
      storeRef: v.storeRef ?? `${v.store}:${v.tier}:${uuidv7()}`,
      status: v.status,
      period: 'monthly',
      currentPeriodEnd: v.currentPeriodEnd,
      autoRenew: v.autoRenew,
    });
  }

  // ───────── GET /me/billing ─────────

  managementUrl(store: string, tier: string): string | null {
    if (store === 'apple') return MANAGE_SUBSCRIPTION_URLS.apple;
    if (store === 'google') {
      const sku = this.skuForTier(tier);
      const params = new URLSearchParams();
      if (this.cfg.androidPackageName) params.set('package', this.cfg.androidPackageName);
      if (sku) params.set('sku', normalizeProductId(this.catalog()[sku].android));
      const qs = params.toString();
      return qs ? `${MANAGE_SUBSCRIPTION_URLS.google}?${qs}` : MANAGE_SUBSCRIPTION_URLS.google;
    }
    return null;
  }

  private skuForTier(tier: string): Sku | null {
    return tier === 'plus' ? 'plus_monthly' : tier === 'gold' ? 'gold_monthly' : tier === 'passport_addon' ? 'passport_addon_monthly' : null;
  }

  async myBilling(accountId: string, now = new Date()): Promise<MeBillingResponse> {
    const [state, subs, events] = await Promise.all([
      this.entitlements.billing(accountId, now),
      this.db
        .select()
        .from(t.subscriptions)
        .where(and(eq(t.subscriptions.accountId, accountId), eq(t.subscriptions.status, 'active'), gt(t.subscriptions.currentPeriodEnd, now)))
        .orderBy(desc(t.subscriptions.createdAt)),
      this.db
        .select({ type: t.billingEvents.type, payload: t.billingEvents.payload })
        .from(t.billingEvents)
        .where(eq(t.billingEvents.accountId, accountId))
        .orderBy(desc(t.billingEvents.receivedAt))
        .limit(100),
    ]);
    const catalog = this.catalog();
    const familyOf = (tier: string) => (tier === 'passport_addon' ? 'addon' : 'plan');
    const billingIssue = (row: SubRow): boolean => {
      for (const ev of events) {
        const p = (ev.payload as { event?: RevenueCatEvent }).event;
        const sku = skuForProductId(p?.product_id, catalog);
        const evTier = sku ? subscriptionTierForSku(sku) : null;
        if (!evTier || familyOf(evTier) !== familyOf(row.tier) || storeName(p?.store) !== row.store) continue;
        if (ev.type === 'BILLING_ISSUE') return true;
        if (['INITIAL_PURCHASE', 'RENEWAL', 'UNCANCELLATION', 'PRODUCT_CHANGE', 'EXPIRATION'].includes(ev.type)) return false;
      }
      return false;
    };
    const subscriptions: BillingSubscriptionView[] = subs
      .sort((a, b) => Number(b.tier !== 'passport_addon') - Number(a.tier !== 'passport_addon'))
      .map((r) => ({
        id: r.id,
        sku: this.skuForTier(r.tier),
        tier: r.tier as PlanTier | 'passport_addon',
        store: r.store,
        status: r.status,
        currentPeriodEnd: r.currentPeriodEnd.toISOString(),
        autoRenew: r.autoRenew,
        billingIssue: billingIssue(r),
        managementUrl: this.managementUrl(r.store, r.tier),
      }));
    const passes: BillingPassView[] = state.livePasses.map((p) => ({
      id: p.id,
      sku: 'passport_pass_7d',
      store: p.store,
      expiresAt: p.expiresAt!.toISOString(),
      free: p.store === 'plus_quarterly',
    }));
    return {
      tier: state.tier,
      subscriptions,
      passes,
      managementUrl: subscriptions.find((s) => s.managementUrl)?.managementUrl ?? null,
      devGrantAvailable: !this.config.isProduction,
      storeSyncAvailable: !!this.cfg.revenuecatApiKey,
    };
  }

  private async response(accountId: string, now: Date): Promise<BillingSyncResponse> {
    const [billing, snap] = await Promise.all([this.myBilling(accountId, now), this.entitlements.snapshot(accountId, now)]);
    return { ok: true, billing, entitlements: snap.entitlements };
  }

  // ───────── POST /billing/sync ─────────

  /** Re-reads the subscriber from RevenueCat REST API v1 and reconciles our rows (missed webhooks, restore). */
  async sync(accountId: string, now = new Date()): Promise<BillingSyncResponse> {
    const key = this.cfg.revenuecatApiKey;
    if (!key) {
      throw new HttpException(
        {
          error: 'store_sync_unavailable',
          message: 'Store sync is not configured on this server (set REVENUECAT_API_KEY). Purchases still arrive through the RevenueCat webhook.',
        },
        HttpStatus.NOT_IMPLEMENTED,
      );
    }
    let data: RcSubscriberResponse;
    try {
      const res = await fetch(`${this.cfg.revenuecatApiUrl}/subscribers/${encodeURIComponent(accountId)}`, {
        headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
      });
      if (!res.ok) throw new HttpException({ error: 'store_sync_failed', status: res.status }, HttpStatus.BAD_GATEWAY);
      data = (await res.json()) as RcSubscriberResponse;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      throw new HttpException({ error: 'store_sync_failed' }, HttpStatus.BAD_GATEWAY);
    }
    const subscriber = data.subscriber ?? {};
    const catalog = this.catalog();
    await this.db.transaction(async (txRaw) => {
      const tx = txRaw as unknown as Db;
      for (const [productId, s] of Object.entries(subscriber.subscriptions ?? {})) {
        const sku = skuForProductId(productId, catalog);
        const tier = sku ? subscriptionTierForSku(sku) : null;
        if (!sku || !tier) continue;
        const store = storeName(s.store?.toUpperCase());
        const expires = iso(s.expires_date);
        const grace = iso(s.grace_period_expires_date);
        const end = grace && expires && grace > expires ? grace : expires;
        if (!end) continue;
        const refunded = !!s.refunded_at;
        const status = refunded ? 'refunded' : end > now ? 'active' : 'expired';
        const existing = await this.findSubRow(tx, accountId, tier, store, null);
        await this.upsertSub(tx, existing, {
          accountId,
          tier,
          store,
          storeRef: existing?.storeRef ?? (s.store_transaction_id ? String(s.store_transaction_id) : null),
          status,
          currentPeriodEnd: refunded && end > now ? now : end,
          autoRenew: status === 'active' && !s.unsubscribe_detected_at,
        });
      }
      for (const [productId, list] of Object.entries(subscriber.non_subscriptions ?? {})) {
        if (skuForProductId(productId, catalog) !== 'passport_pass_7d') continue;
        for (const item of list ?? []) {
          const ref = String(item.store_transaction_id ?? item.id ?? '');
          if (!ref) continue;
          const [found] = await tx.select({ id: t.purchases.id }).from(t.purchases).where(and(eq(t.purchases.accountId, accountId), eq(t.purchases.storeRef, ref))).limit(1);
          if (found) continue;
          const purchasedAt = iso(item.purchase_date) ?? now;
          await tx.insert(t.purchases).values({
            id: uuidv7(),
            accountId,
            sku: 'passport_pass_7d',
            store: storeName(item.store?.toUpperCase()),
            storeRef: ref,
            status: 'fulfilled',
            fulfilledAt: purchasedAt,
            expiresAt: addDays(purchasedAt, PASSPORT_PASS_DAYS),
          });
        }
      }
    });
    return this.response(accountId, now);
  }

  // ───────── POST /billing/free-pass ─────────

  /** Plus quarterly free 7-day pass. No store involved, so it works in production too. */
  async claimFreePass(accountId: string, now = new Date()): Promise<BillingSyncResponse> {
    const snap = await this.entitlements.snapshot(accountId, now);
    if (!snap.freePassAvailable) throw new ForbiddenException({ error: 'free_pass_unavailable' });
    await this.entitlements.grantFreeQuarterlyPass(accountId, now);
    return this.response(accountId, now);
  }
}

/** The parts of RevenueCat `GET /v1/subscribers/:id` we read. */
interface RcSubscriberResponse {
  subscriber?: {
    subscriptions?: Record<
      string,
      {
        expires_date?: string | null;
        purchase_date?: string | null;
        store?: string | null;
        unsubscribe_detected_at?: string | null;
        billing_issues_detected_at?: string | null;
        grace_period_expires_date?: string | null;
        refunded_at?: string | null;
        store_transaction_id?: string | number | null;
      }
    >;
    non_subscriptions?: Record<string, Array<{ id?: string; purchase_date?: string | null; store?: string | null; store_transaction_id?: string | number | null }>>;
    management_url?: string | null;
  };
}
