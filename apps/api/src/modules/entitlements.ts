import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  PLAN_LIMITS,
  passportCapacity,
  SKU_PRICES_USD,
  type Entitlements,
  type PlanLimits,
  type PlanTier,
  type Sku,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { uuidv7 } from '../common/ids';
import { addDays, DAY_MS } from '../common/time';
import { groupBy } from '../common/collections';

export const PASS_MONTH_DAYS = 30;
/** Plus gets one free 7-day Passport pass per quarter (spec 01 §73). */
export const FREE_PASS_WINDOW_DAYS = 90;

export interface BillingState {
  tier: PlanTier;
  limits: PlanLimits;
  planSub: typeof t.subscriptions.$inferSelect | null;
  addonActive: boolean;
  addonPeriodEnd: Date | null;
  /** Live (unexpired, fulfilled) 7-day passes, newest first. */
  livePasses: Array<typeof t.purchases.$inferSelect>;
}

export interface BillingSnapshot {
  entitlements: Entitlements;
  billing: BillingState;
  freePassAvailable: boolean;
}

export function tierFromSubscription(rows: Array<typeof t.subscriptions.$inferSelect>, now: Date): typeof t.subscriptions.$inferSelect | null {
  return (
    rows.find((r) => ['plus', 'gold', 'elite'].includes(r.tier) && r.status === 'active' && r.currentPeriodEnd > now) ?? null
  );
}

function isLivePass(row: typeof t.purchases.$inferSelect, now: Date): boolean {
  return row.sku === 'passport_pass_7d' && row.status === 'fulfilled' && !!row.expiresAt && row.expiresAt > now;
}

@Injectable()
export class EntitlementsService {
  constructor(@Inject(DB) private readonly db: Db) {}

  /** Bulk-loads subscriptions + live Passport passes for a set of accounts. */
  private async loadBilling(accountIds: string[], now: Date): Promise<Map<string, BillingState>> {
    const out = new Map<string, BillingState>();
    if (accountIds.length === 0) return out;
    const [subs, purchases] = await Promise.all([
      this.db.select().from(t.subscriptions).where(inArray(t.subscriptions.accountId, accountIds)).orderBy(desc(t.subscriptions.createdAt)),
      this.db.select().from(t.purchases).where(and(inArray(t.purchases.accountId, accountIds), eq(t.purchases.status, 'fulfilled'))),
    ]);
    const subsBy = groupBy(subs, (r) => r.accountId);
    const purchasesBy = groupBy(purchases, (r) => r.accountId);
    for (const id of accountIds) {
      const rows = subsBy.get(id) ?? [];
      const planSub = tierFromSubscription(rows, now);
      const addon = rows.find((r) => r.tier === 'passport_addon' && r.status === 'active' && r.currentPeriodEnd > now) ?? null;
      const livePasses = (purchasesBy.get(id) ?? []).filter((p) => isLivePass(p, now)).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      const tier: PlanTier = (planSub?.tier as PlanTier) ?? 'free';
      out.set(id, {
        tier,
        limits: PLAN_LIMITS[tier],
        planSub,
        addonActive: !!addon,
        addonPeriodEnd: addon?.currentPeriodEnd ?? null,
        livePasses,
      });
    }
    return out;
  }

  async billing(accountId: string, now = new Date()): Promise<BillingState> {
    const m = await this.loadBilling([accountId], now);
    return (
      m.get(accountId) ?? {
        tier: 'free',
        limits: PLAN_LIMITS.free,
        planSub: null,
        addonActive: false,
        addonPeriodEnd: null,
        livePasses: [],
      }
    );
  }

  async snapshot(accountId: string, now = new Date()): Promise<BillingSnapshot> {
    const billing = await this.billing(accountId, now);
    const freePassAvailable = await this.isFreePassAvailable(accountId, billing, now);
    const activeUntil = [
      billing.addonPeriodEnd,
      ...billing.livePasses.map((p) => p.expiresAt),
      billing.planSub?.currentPeriodEnd ?? null,
    ].filter((d): d is Date => !!d && d > now);

    const hasActivePass = billing.livePasses.length > 0 || billing.addonActive;
    const passportIncluded = billing.limits.passport.included;
    const source: Entitlements['passport']['source'] = passportIncluded
      ? 'plan'
      : billing.addonActive
        ? 'addon'
        : hasActivePass
          ? 'pass'
          : 'none';
    const passExpiries = billing.livePasses.map((p) => p.expiresAt!.getTime());
    const entitlements: Entitlements = {
      tier: billing.tier,
      limits: billing.limits,
      passport: {
        capacity: passportCapacity(billing.tier, billing.addonActive, hasActivePass),
        source,
        passExpiresAt: passExpiries.length ? new Date(Math.max(...passExpiries)).toISOString() : null,
        freePassAvailable,
      },
    };
    void activeUntil;
    return { entitlements, billing, freePassAvailable };
  }

  /** Plus's quarterly free pass: available when the tier includes it and none was granted in the last 90 days. */
  private async isFreePassAvailable(accountId: string, billing: BillingState, now: Date): Promise<boolean> {
    if (!billing.limits.passport.quarterlyFreePass) return false;
    const since = new Date(now.getTime() - FREE_PASS_WINDOW_DAYS * DAY_MS);
    const usedRecently = await this.db
      .select({ expiresAt: t.purchases.expiresAt, createdAt: t.purchases.createdAt })
      .from(t.purchases)
      .where(and(eq(t.purchases.accountId, accountId), eq(t.purchases.store, 'plus_quarterly')))
      .orderBy(desc(t.purchases.createdAt))
      .limit(1);
    const last = usedRecently[0];
    if (!last) return true;
    const at = last.createdAt;
    return at < since;
  }

  /** Passport capacities for many accounts at once (used when loading candidates). */
  async passportCapacities(accountIds: string[], now = new Date()): Promise<Map<string, number>> {
    const billing = await this.loadBilling(accountIds, now);
    const out = new Map<string, number>();
    for (const id of accountIds) {
      const b = billing.get(id);
      if (!b) {
        out.set(id, 0);
        continue;
      }
      out.set(id, passportCapacity(b.tier, b.addonActive, b.livePasses.length > 0 || b.addonActive));
    }
    return out;
  }

  /** Records a fulfilled purchase (dev grant or store receipt) and grants the SKU. */
  async grant(accountId: string, sku: Sku | 'free', now = new Date(), store = 'dev'): Promise<void> {
    if (sku === 'free') {
      await this.cancel(accountId, now);
      return;
    }
    if (sku === 'plus_monthly' || sku === 'gold_monthly') {
      const tier: PlanTier = sku === 'plus_monthly' ? 'plus' : 'gold';
      // Replace the existing plan subscription (dev semantics: immediate switch).
      await this.db.update(t.subscriptions).set({ status: 'cancelled' }).where(and(eq(t.subscriptions.accountId, accountId), inArray(t.subscriptions.tier, ['plus', 'gold', 'elite'])));
      await this.db.insert(t.subscriptions).values({
        id: uuidv7(),
        accountId,
        tier,
        store,
        status: 'active',
        period: 'monthly',
        currentPeriodEnd: addDays(now, PASS_MONTH_DAYS),
        autoRenew: true,
      });
      return;
    }
    if (sku === 'passport_addon_monthly') {
      await this.db.insert(t.subscriptions).values({
        id: uuidv7(),
        accountId,
        tier: 'passport_addon',
        store,
        status: 'active',
        period: 'monthly',
        currentPeriodEnd: addDays(now, PASS_MONTH_DAYS),
        autoRenew: true,
      });
      return;
    }
    // passport_pass_7d
    await this.db.insert(t.purchases).values({
      id: uuidv7(),
      accountId,
      sku,
      store,
      amountMinor: SKU_PRICES_USD[sku],
      currency: 'USD',
      status: 'fulfilled',
      fulfilledAt: now,
      expiresAt: addDays(now, 7),
    });
  }

  /** Grants the Plus quarterly free pass (store = 'plus_quarterly' so it is throttled to one per 90 days). */
  async grantFreeQuarterlyPass(accountId: string, now = new Date()): Promise<void> {
    await this.db.insert(t.purchases).values({
      id: uuidv7(),
      accountId,
      sku: 'passport_pass_7d',
      store: 'plus_quarterly',
      amountMinor: 0,
      currency: 'USD',
      status: 'fulfilled',
      fulfilledAt: now,
      expiresAt: addDays(now, 7),
    });
  }

  /** Cancels plan + add-on subscriptions and expires live passes. */
  async cancel(accountId: string, now = new Date()): Promise<void> {
    await this.db
      .update(t.subscriptions)
      .set({ status: 'cancelled', autoRenew: false })
      .where(and(eq(t.subscriptions.accountId, accountId), eq(t.subscriptions.status, 'active')));
    await this.db
      .update(t.purchases)
      .set({ expiresAt: now })
      .where(and(eq(t.purchases.accountId, accountId), eq(t.purchases.status, 'fulfilled')));
  }

  /** Convenience for other services. */
  async tier(accountId: string, now = new Date()): Promise<PlanTier> {
    return (await this.billing(accountId, now)).tier;
  }

  async planLimits(accountId: string, now = new Date()): Promise<PlanLimits> {
    return (await this.billing(accountId, now)).limits;
  }

}
