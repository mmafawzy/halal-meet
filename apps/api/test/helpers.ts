import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { NestExpressApplication } from '@nestjs/platform-express';
import { NestFactory } from '@nestjs/core';
import { sql } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DB, openDatabase, type Db, type DbHandle } from '../src/db/client';
import * as t from '../src/db/schema';
import { uuidv7 } from '../src/common/ids';
import { Answers } from './fixtures';

export interface TestContext {
  db: Db;
  http: request.Agent;
  close: () => Promise<void>;
}

/**
 * Boots the real Nest app against an in-memory PGlite database (no DATABASE_URL, no PGLITE_DIR), so the
 * HTTP surface, guards, pipes and SQL all run exactly as in production.
 */
export async function createTestApp(): Promise<TestContext> {
  process.env.PGLITE_DIR = 'memory';
  process.env.JWT_SECRET = 'test-secret';
  process.env.NODE_ENV = 'test';

  const handle: DbHandle = await openDatabase({ url: null, dataDir: null });
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DB)
    .useValue(handle.db)
    .compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>();
  await app.init();
  const http = request(app.getHttpServer() as App);
  return {
    db: handle.db,
    http,
    close: async () => {
      await app.close();
      await handle.close();
    },
  };
}

export function stamp(now = new Date()): () => Date {
  return () => now;
}

/** Creates a member directly in the DB (fast path for fixtures) and returns their id + token. */
export interface MemberOptions {
  id?: string;
  phone?: string;
  gender: 'male' | 'female';
  age?: number;
  country?: string;
  city?: string;
  identityVerified?: boolean;
  intlVisibility?: 'on' | 'relocating_only' | 'off';
  profileStrength?: number;
  intention?: string;
  halalMode?: string;
  acceptedModes?: string[];
  languages?: string[];
  maritalStatus?: string;
  hasChildren?: boolean;
  openToRelocate?: boolean;
  photoUrl?: string | null;
  photoVisibility?: string;
  createdAt?: Date;
  preferences?: Partial<{ ageMin: number; ageMax: number; verifiedOnly: boolean; acceptChildren: boolean; maritalStatuses: string[] | null; languages: string[] | null }>;
  answers?: Answers;
  subscription?: 'plus' | 'gold';
  passportPass?: { country: string; purpose?: string; visitFrom?: string | null; visitTo?: string | null; visibleFrom?: Date; activeUntil?: Date | null };
}

export async function createMember(ctx: TestContext, opts: MemberOptions) {
  const id = opts.id ?? uuidv7();
  const phone = opts.phone ?? `+2010${String(Math.floor(Math.random() * 1e7)).padStart(7, '0')}`;
  const age = opts.age ?? 28;
  const birthDate = new Date(Date.UTC(new Date().getUTCFullYear() - age, 5, 15)).toISOString().slice(0, 10);
  const createdAt = opts.createdAt ?? new Date(Date.now() - 30 * 86_400_000);
  await ctx.db.insert(t.accounts).values({ id, phoneE164: phone, locale: 'en', status: 'active', role: 'member', createdAt });
  await ctx.db.insert(t.profiles).values({
    accountId: id,
    firstName: opts.gender === 'male' ? 'Ahmed' : 'Sara',
    gender: opts.gender,
    birthDate,
    nationality: [opts.country ?? 'EG'],
    country: opts.country ?? 'EG',
    city: opts.city ?? 'Cairo',
    languages: opts.languages ?? ['ar', 'en'],
    heightCm: 175,
    maritalStatus: opts.maritalStatus ?? 'never_married',
    hasChildren: opts.hasChildren ?? false,
    educationLevel: 'bachelor',
    profession: 'Engineer',
    intention: opts.intention ?? 'within_1y',
    halalMode: opts.halalMode ?? 'guided',
    acceptedModes: opts.acceptedModes ?? ['private', 'guided', 'wali'],
    about: 'A complete profile for tests, describing values, family and work life in a respectful way.',
    photoUrl: opts.photoUrl ?? null,
    photoVisibility: opts.photoVisibility ?? 'matches',
    openToRelocate: opts.openToRelocate ?? false,
    relocateCountries: [],
    intlVisibility: opts.intlVisibility ?? 'on',
    profileStrength: opts.profileStrength ?? 85,
    createdAt,
    updatedAt: createdAt,
  });
  await ctx.db.insert(t.matchPreferences).values({
    accountId: id,
    ageMin: opts.preferences?.ageMin ?? 18,
    ageMax: opts.preferences?.ageMax ?? 45,
    maritalStatuses: opts.preferences?.maritalStatuses ?? null,
    acceptChildren: opts.preferences?.acceptChildren ?? true,
    verifiedOnly: opts.preferences?.verifiedOnly ?? false,
    languages: opts.preferences?.languages ?? null,
    dimensionImportance: {},
  });
  await ctx.db.insert(t.verifications).values({ id: randomUUID(), accountId: id, kind: 'phone', status: 'approved', vendor: 'test', decidedAt: new Date() });
  if (opts.identityVerified ?? true) {
    await ctx.db.insert(t.verifications).values({ id: randomUUID(), accountId: id, kind: 'identity', status: 'approved', vendor: 'test', decidedAt: new Date() });
  }
  for (const [questionKey, a] of Object.entries(opts.answers ?? {})) {
    await ctx.db
      .insert(t.answers)
      .values({ accountId: id, questionKey, selfValue: a.self as never, partnerAccept: a.accept as never, importance: a.importance, answeredAt: new Date() });
  }
  if (opts.subscription) {
    await ctx.db.insert(t.subscriptions).values({
      id: uuidv7(),
      accountId: id,
      tier: opts.subscription,
      store: 'test',
      status: 'active',
      period: 'monthly',
      currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000),
      autoRenew: true,
    });
  }
  if (opts.passportPass) {
    const { country, purpose = 'relocate', visitFrom = null, visitTo = null, visibleFrom = new Date(Date.now() - 86_400_000), activeUntil = new Date(Date.now() + 7 * 86_400_000) } = opts.passportPass;
    await ctx.db.insert(t.purchases).values({
      id: uuidv7(),
      accountId: id,
      sku: 'passport_pass_7d',
      store: 'test',
      status: 'fulfilled',
      fulfilledAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 86_400_000),
    });
    await ctx.db.insert(t.passportDestinations).values({
      id: uuidv7(),
      accountId: id,
      country,
      city: null,
      purpose,
      visitFrom,
      visitTo,
      visibleFrom,
      activeUntil,
      status: 'active',
      source: 'pass',
    });
  }
  return { id, phone };
}

/** Logs in via the dev OTP flow and returns the bearer token. */
export async function login(ctx: TestContext, phone: string): Promise<string> {
  await ctx.http.post('/auth/otp/request').send({ phone }).expect(200);
  const res = await ctx.http.post('/auth/otp/verify').send({ phone, code: '000000' }).expect(200);
  return res.body.token as string;
}

export async function truncateAll(db: Db): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      billing_events, moderation_actions, notifications, notification_prefs, devices, consents,
      photo_access_requests, photos,
      stage_approvals, guardian_shares, guardian_opinions, guardianships,
      topic_answers, topic_coverage, messages, stage_readiness, matches,
      interests, passes, blocks, reports, top_picks, feed_impressions,
      passport_destinations, purchases, subscriptions, usage_events,
      answers, match_preferences, verifications, country_status_overrides,
      profiles, accounts
    RESTART IDENTITY CASCADE
  `);
}

void NestFactory;
