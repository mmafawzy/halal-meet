import { randomUUID } from 'node:crypto';
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { and, count, eq, gte, inArray } from 'drizzle-orm';
import type { Usage } from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { DAY_MS, localDayStart, nextLocalMidnight, tzForCountry } from '../common/time';
import { EntitlementsService } from './entitlements';

export const LIMIT_REACHED = 'limit_reached';

@Injectable()
export class UsageService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
  ) {}

  /** Daily interests reset at the user's local midnight; the timezone is derived from their country. */
  async usage(accountId: string, country: string | null, now = new Date()): Promise<Usage> {
    const tz = tzForCountry(country);
    const { entitlements } = await this.entitlements.snapshot(accountId, now);
    const limits = entitlements.limits;
    const dayStart = localDayStart(now, tz);
    const seriousStart = new Date(now.getTime() - limits.seriousInterest.windowDays * DAY_MS);
    const since = seriousStart < dayStart ? seriousStart : dayStart;

    const rows = await this.db
      .select({ kind: t.usageEvents.kind, at: t.usageEvents.at })
      .from(t.usageEvents)
      .where(and(eq(t.usageEvents.accountId, accountId), gte(t.usageEvents.at, since)));

    let interestsToday = 0;
    let seriousUsed = 0;
    for (const r of rows) {
      if (r.kind === 'interest' && r.at >= dayStart) interestsToday++;
      else if (r.kind === 'serious' && r.at >= seriousStart) seriousUsed++;
    }

    return {
      interestsToday,
      interestsLimit: limits.dailyInterests,
      seriousUsed,
      seriousLimit: limits.seriousInterest.count,
      topPicksPerDay: limits.topPicksPerDay,
      resetsAt: nextLocalMidnight(now, tz).toISOString(),
    };
  }

  /** Throws 402 with `{ error: 'limit_reached', usage }` when the user is over their allowance. */
  async assertCanSendInterest(accountId: string, country: string | null, level: 'interest' | 'serious', now = new Date()): Promise<Usage> {
    const usage = await this.usage(accountId, country, now);
    const limited =
      level === 'interest'
        ? usage.interestsLimit !== null && usage.interestsToday >= usage.interestsLimit
        : usage.seriousUsed >= usage.seriousLimit;
    if (limited) throw new HttpException({ error: LIMIT_REACHED, usage }, 402);
    return usage;
  }

  async recordInterest(accountId: string, level: 'interest' | 'serious', now = new Date()): Promise<void> {
    await this.db.insert(t.usageEvents).values({ id: randomUUID(), accountId, kind: level, at: now });
  }

  /** Pending (unanswered) inbound interests per account — exposure-pacing input. */
  async pendingInbound(accountIds: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (accountIds.length === 0) return out;
    const rows = await this.db
      .select({ toId: t.interests.toId, n: count() })
      .from(t.interests)
      .where(and(inArray(t.interests.toId, accountIds), eq(t.interests.status, 'pending')))
      .groupBy(t.interests.toId);
    for (const r of rows) out.set(r.toId, Number(r.n));
    return out;
  }
}
