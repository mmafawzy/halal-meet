/**
 * Account visibility (privacy centre + moderation, spec 05). One place decides who may appear to whom, so
 * every discovery surface (feed, Top Picks, incoming interests, profile lookups, Passport counts) applies the
 * same rules. See the header of packages/core/src/privacy.ts for the rules themselves.
 */
import { and, eq, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Db } from '../db/client';
import * as t from '../db/schema';

/**
 * Accounts that may be discovered at all (ignores incognito): active, or paused/suspended whose end date has
 * passed (lazy auto-resume), with no pending deletion request.
 */
export function discoverableSql(now: Date): SQL {
  return and(
    or(
      eq(t.accounts.status, 'active'),
      and(eq(t.accounts.status, 'paused'), isNotNull(t.accounts.pausedUntil), lte(t.accounts.pausedUntil, now)),
      and(eq(t.accounts.status, 'suspended'), isNotNull(t.accounts.suspendedUntil), lte(t.accounts.suspendedUntil, now)),
    ),
    or(isNull(t.accounts.suspendedUntil), lte(t.accounts.suspendedUntil, now)),
    isNull(t.accounts.deletionRequestedAt),
  )!;
}

/** Discoverable by `viewerId`: also hides incognito members unless they sent the viewer an interest or are matched. */
export function visibleToSql(viewerId: string, now: Date): SQL {
  return and(
    discoverableSql(now),
    or(
      eq(t.accounts.incognito, false),
      sql`exists (select 1 from ${t.interests} where ${t.interests.fromId} = ${t.accounts.id} and ${t.interests.toId} = ${viewerId})`,
      sql`exists (select 1 from ${t.matches} where (${t.matches.aId} = ${t.accounts.id} and ${t.matches.bId} = ${viewerId}) or (${t.matches.bId} = ${t.accounts.id} and ${t.matches.aId} = ${viewerId}))`,
    ),
  )!;
}

/** The subset of `ids` that `viewerId` may see right now. */
export async function visibleIds(db: Db, viewerId: string, ids: string[], now = new Date()): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const rows = await db
    .select({ id: t.accounts.id })
    .from(t.accounts)
    .where(and(inArray(t.accounts.id, unique), visibleToSql(viewerId, now)));
  return new Set(rows.map((r) => r.id));
}

/**
 * Accounts that are gone for everyone, including existing matches: deletion requested, banned or deleted.
 * (Paused, incognito and temporarily suspended members keep their existing conversations.)
 */
export async function goneIds(db: Db, ids: string[]): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();
  const rows = await db
    .select({ id: t.accounts.id })
    .from(t.accounts)
    .where(and(inArray(t.accounts.id, unique), or(isNotNull(t.accounts.deletionRequestedAt), inArray(t.accounts.status, ['banned', 'deleted']))));
  return new Set(rows.map((r) => r.id));
}
