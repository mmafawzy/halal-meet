import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  COUNTRIES,
  computeCountryStatus,
  type CountryStatus,
  type CountryWithStatus,
} from '@halal-meet/core';
import { CONFIG, type AppConfig } from '../config';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';

const CACHE_TTL_MS = 5 * 60_000;

export interface CountryStats {
  verifiedProfiles: number;
  memberProfiles: number;
  maleShare: number;
}

@Injectable()
export class CountriesService {
  private cache: { at: number; data: Map<string, CountryStats> } | null = null;

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
  ) {}

  private async stats(): Promise<Map<string, CountryStats>> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.data;
    const rows = await this.db
      .select({
        country: t.profiles.country,
        gender: t.profiles.gender,
        verified: sql<number>`count(${t.verifications.id})`,
        total: sql<number>`count(*)`,
      })
      .from(t.profiles)
      .leftJoin(
        t.verifications,
        and(eq(t.verifications.accountId, t.profiles.accountId), eq(t.verifications.kind, 'identity'), eq(t.verifications.status, 'approved')),
      )
      .groupBy(t.profiles.country, t.profiles.gender);

    const acc = new Map<string, { total: number; verified: number; male: number }>();
    for (const r of rows) {
      const cur = acc.get(r.country) ?? { total: 0, verified: 0, male: 0 };
      const total = Number(r.total);
      cur.total += total;
      cur.verified += Number(r.verified);
      if (r.gender === 'male') cur.male += total;
      acc.set(r.country, cur);
    }
    const data = new Map<string, CountryStats>();
    for (const [country, v] of acc) {
      data.set(country, {
        verifiedProfiles: v.verified,
        memberProfiles: v.total,
        maleShare: v.total > 0 ? v.male / v.total : 0.5,
      });
    }
    this.cache = { at: Date.now(), data };
    return data;
  }

  /** Clears the status cache (call after seeding). */
  invalidate(): void {
    this.cache = null;
  }

  /** Status resolver bound to a fresh stats snapshot (used by feed/eligibility). */
  async resolver(): Promise<{ countryStatus: (country: string) => CountryStatus; stats: Map<string, CountryStats> }> {
    const stats = await this.stats();
    const overrides = this.config.countryStatusOverrides;
    const seeded = await this.db.select().from(t.countryStatusOverrides);
    for (const row of seeded) {
      if (row.status === 'open' || row.status === 'growing') overrides[row.code] = row.status;
    }
    return {
      countryStatus: (country: string) => {
        const override = overrides[country];
        if (override) return override;
        const s = stats.get(country);
        return s ? computeCountryStatus(s.verifiedProfiles, s.maleShare) : 'growing';
      },
      stats,
    };
  }

  async list(): Promise<CountryWithStatus[]> {
    const { countryStatus, stats } = await this.resolver();
    return COUNTRIES.map((c) => ({
      code: c.code,
      status: countryStatus(c.code),
      verifiedProfiles: stats.get(c.code)?.verifiedProfiles ?? 0,
    }));
  }
}
