import { randomUUID } from 'node:crypto';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Put,
  Post,
  Query,
} from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';
import {
  type Answer,
  type CountryWithStatus,
  type Entitlements,
  type MatchPreferencesInput,
  type MeResponse,
  type MyProfile,
  type OtpVerifyResponse,
  type Usage,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { CONFIG, type AppConfig } from '../config';
import { Public, UserId, ZodPipe } from '../common/http';
import { ageFromBirthDate, tzForCountry } from '../common/time';
import { uuidv7 } from '../common/ids';
import { AuthService } from './auth.service';
import { CountriesService } from './countries';
import { EntitlementsService } from './entitlements';
import { MembersService, computeProfileStrength, defaultPreferences, sanitizeAnswer } from './members';
import { UsageService } from './usage';
import {
  answersBodySchema,
  blockSchema,
  devGrantSchema,
  otpRequestSchema,
  otpVerifySchema,
  preferencesBodySchema,
  profileInputSchema,
  profileUpdateSchema,
  reportSchema,
} from './dtos';

@Controller()
export class AccountController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) private readonly config: AppConfig,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
    @Inject(UsageService) private readonly usage: UsageService,
    @Inject(CountriesService) private readonly countries: CountriesService,
  ) {}

  // ───────── Auth ─────────
  @Public()
  @Post('auth/otp/request')
  @HttpCode(200)
  otpRequest(@Body(new ZodPipe(otpRequestSchema)) body: { phone: string }): { ok: true } {
    this.auth.issueCode(body.phone);
    return { ok: true };
  }

  @Public()
  @Post('auth/otp/verify')
  @HttpCode(200)
  async otpVerify(@Body(new ZodPipe(otpVerifySchema)) body: { phone: string; code: string }): Promise<OtpVerifyResponse> {
    if (!this.auth.verifyCode(body.phone, body.code)) throw new ForbiddenException({ error: 'invalid_code' });
    const existing = await this.db.select().from(t.accounts).where(eq(t.accounts.phoneE164, body.phone));
    const account = existing[0];
    if (account) {
      await this.db.update(t.accounts).set({ lastActiveAt: new Date() }).where(eq(t.accounts.id, account.id));
      return { token: this.auth.sign(account.id), accountId: account.id, isNew: false };
    }
    const id = uuidv7();
    await this.db.insert(t.accounts).values({ id, phoneE164: body.phone, locale: 'ar', status: 'active', role: 'member' });
    // Phone verification is granted by a successful OTP.
    await this.db.insert(t.verifications).values({ id: uuidv7(), accountId: id, kind: 'phone', status: 'approved', vendor: 'otp', decidedAt: new Date() });
    return { token: this.auth.sign(id), accountId: id, isNew: true };
  }

  // ───────── Me ─────────
  @Get('me')
  async me(@UserId() id: string): Promise<MeResponse> {
    const [account] = await this.db.select().from(t.accounts).where(eq(t.accounts.id, id));
    if (!account) throw new ForbiddenException({ error: 'unknown_account' });
    const member = await this.members.get(id);
    const { entitlements } = await this.entitlements.snapshot(id);
    const usage = await this.usage.usage(id, member?.row.country ?? null);
    const answersCount = member?.match.answers.length ?? 0;
    return {
      accountId: id,
      locale: (account.locale as 'en' | 'ar') ?? 'ar',
      profile: member ? this.members.toMyProfile(member) : null,
      answersCount,
      onboardingComplete: !!member && this.members.isOnboardingComplete(member),
      entitlements,
      usage,
    };
  }

  @Put('me/profile')
  @HttpCode(200)
  async updateProfile(@UserId() id: string, @Body(new ZodPipe(profileUpdateSchema)) body: Record<string, unknown>): Promise<{ ok: true }> {
    const { locale, ...input } = body as { locale?: 'en' | 'ar' } & Record<string, unknown>;
    const age = ageFromBirthDate(input.birthDate as string);
    if (age < 18) throw new BadRequestException({ error: 'underage' });
    if (age > 99) throw new BadRequestException({ error: 'invalid_birth_date' });
    const existing = await this.db.select().from(t.profiles).where(eq(t.profiles.accountId, id));
    const values = {
      accountId: id,
      firstName: input.firstName as string,
      gender: input.gender as string,
      birthDate: input.birthDate as string,
      nationality: input.nationality as string[],
      country: input.country as string,
      city: input.city as string,
      languages: input.languages as string[],
      heightCm: (input.heightCm as number | null | undefined) ?? null,
      maritalStatus: input.maritalStatus as string,
      hasChildren: input.hasChildren as boolean,
      educationLevel: (input.educationLevel as string | null | undefined) ?? null,
      profession: (input.profession as string | null | undefined) ?? null,
      intention: input.intention as string,
      halalMode: input.halalMode as string,
      acceptedModes: input.acceptedModes as string[],
      about: (input.about as string | null | undefined) ?? null,
      photoVisibility: input.photoVisibility as string,
      openToRelocate: input.openToRelocate as boolean,
      relocateCountries: input.relocateCountries as string[],
      intlVisibility: input.intlVisibility as string,
      updatedAt: new Date(),
    };
    if (existing[0]) {
      await this.db.update(t.profiles).set(values).where(eq(t.profiles.accountId, id));
    } else {
      const strength = computeProfileStrength({ ...values, photoUrl: null, profileStrength: 0, createdAt: new Date() } as never, 0, ['phone']);
      await this.db.insert(t.profiles).values({ ...values, profileStrength: strength });
      // Sensible defaults derived from the profile (age range, verified-only for women).
      const prefs = defaultPreferences(values.gender as 'male' | 'female', age);
      await this.db
        .insert(t.matchPreferences)
        .values({
          accountId: id,
          ageMin: prefs.ageMin,
          ageMax: prefs.ageMax,
          maritalStatuses: prefs.maritalStatuses,
          acceptChildren: prefs.acceptChildren,
          verifiedOnly: prefs.verifiedOnly,
          languages: prefs.languages,
          dimensionImportance: {},
        })
        .onConflictDoNothing();
    }
    if (locale) await this.db.update(t.accounts).set({ locale }).where(eq(t.accounts.id, id));
    await this.members.refreshStrength(id);
    this.countries.invalidate();
    return { ok: true };
  }

  @Get('me/answers')
  async getAnswers(@UserId() id: string): Promise<Answer[]> {
    const rows = await this.db.select().from(t.answers).where(eq(t.answers.accountId, id));
    return rows.map((r) => ({ questionKey: r.questionKey, self: r.selfValue ?? null, accept: r.partnerAccept ?? null, importance: r.importance }));
  }

  @Put('me/answers')
  @HttpCode(200)
  async putAnswers(@UserId() id: string, @Body(new ZodPipe(answersBodySchema)) body: { answers: Answer[] }): Promise<{ ok: true }> {
    const member = await this.members.get(id);
    if (!member) throw new BadRequestException({ error: 'profile_required' });
    const gender = member.match.gender;
    const clean = body.answers.map((a) => sanitizeAnswer(a, gender)).filter((a): a is Answer => !!a);
    const now = new Date();
    for (const a of clean) {
      await this.db
        .insert(t.answers)
        .values({ accountId: id, questionKey: a.questionKey, selfValue: a.self, partnerAccept: a.accept, importance: a.importance, answeredAt: now })
        .onConflictDoUpdate({
          target: [t.answers.accountId, t.answers.questionKey],
          set: { selfValue: a.self, partnerAccept: a.accept, importance: a.importance, answeredAt: now },
        });
    }
    await this.members.refreshStrength(id);
    return { ok: true };
  }

  @Put('me/preferences')
  @HttpCode(200)
  async putPreferences(@UserId() id: string, @Body(new ZodPipe(preferencesBodySchema)) body: MatchPreferencesInput): Promise<{ ok: true }> {
    if (body.ageMin > body.ageMax) throw new BadRequestException({ error: 'invalid_age_range' });
    const member = await this.members.get(id);
    if (!member) throw new BadRequestException({ error: 'profile_required' });
    const values = {
      ageMin: body.ageMin,
      ageMax: body.ageMax,
      maritalStatuses: body.maritalStatuses,
      acceptChildren: body.acceptChildren,
      verifiedOnly: body.verifiedOnly,
      languages: body.languages,
      dimensionImportance: body.dimensionImportance ?? {},
    };
    await this.db
      .insert(t.matchPreferences)
      .values({ accountId: id, ...values })
      .onConflictDoUpdate({ target: t.matchPreferences.accountId, set: values });
    return { ok: true };
  }

  @Get('me/entitlements')
  async getEntitlements(@UserId() id: string): Promise<Entitlements> {
    return (await this.entitlements.snapshot(id)).entitlements;
  }

  // ───────── Billing (dev only) ─────────
  @Post('billing/dev/grant')
  @HttpCode(200)
  async devGrant(@UserId() id: string, @Body(new ZodPipe(devGrantSchema)) body: { sku: 'plus_monthly' | 'gold_monthly' | 'passport_pass_7d' | 'passport_addon_monthly' | 'free' }): Promise<{ ok: true; entitlements: Entitlements }> {
    if (this.config.isProduction) throw new ForbiddenException({ error: 'dev_grant_disabled' });
    await this.entitlements.grant(id, body.sku);
    return { ok: true, entitlements: (await this.entitlements.snapshot(id)).entitlements };
  }

  /** Grants the Plus quarterly free Passport pass (non-prod convenience; Plus entitlement required). */
  @Post('billing/dev/free-pass')
  @HttpCode(200)
  async devFreePass(@UserId() id: string): Promise<{ ok: true }> {
    if (this.config.isProduction) throw new ForbiddenException({ error: 'dev_grant_disabled' });
    const snap = await this.entitlements.snapshot(id);
    if (!snap.freePassAvailable) throw new ForbiddenException({ error: 'free_pass_unavailable' });
    await this.entitlements.grantFreeQuarterlyPass(id);
    return { ok: true };
  }

  // ───────── Safety ─────────
  @Post('reports')
  @HttpCode(200)
  async report(@UserId() id: string, @Body(new ZodPipe(reportSchema)) body: { subjectId: string; category: string; details?: string; messageIds?: string[] }): Promise<{ ok: true }> {
    await this.db.insert(t.reports).values({
      id: uuidv7(),
      reporterId: id,
      subjectId: body.subjectId,
      category: body.category,
      details: body.details ?? null,
      evidenceMessageIds: body.messageIds ?? [],
      status: 'open',
    });
    return { ok: true };
  }

  @Post('blocks')
  @HttpCode(200)
  async block(@UserId() id: string, @Body(new ZodPipe(blockSchema)) body: { subjectId: string }): Promise<{ ok: true }> {
    if (body.subjectId === id) throw new BadRequestException({ error: 'cannot_block_self' });
    await this.db.insert(t.blocks).values({ blockerId: id, blockedId: body.subjectId }).onConflictDoNothing();
    // Blocking also closes any active match (spec: block excludes both ways from feed and matches).
    await this.db
      .update(t.matches)
      .set({ status: 'closed', closedBy: id, closeReason: 'blocked', updatedAt: new Date() })
      .where(
        and(
          eq(t.matches.status, 'active'),
          or(eq(t.matches.aId, id), eq(t.matches.bId, id)),
          or(eq(t.matches.aId, body.subjectId), eq(t.matches.bId, body.subjectId)),
        ),
      );
    return { ok: true };
  }

  @Get('countries')
  async listCountries(): Promise<CountryWithStatus[]> {
    return this.countries.list();
  }

  /** Convenience for clients showing the daily-limit screen. */
  @Get('me/usage')
  async meUsage(@UserId() id: string): Promise<Usage & { timezone: string }> {
    const member = await this.members.get(id);
    const usage = await this.usage.usage(id, member?.row.country ?? null);
    return { ...usage, timezone: tzForCountry(member?.row.country) };
  }

  @Get('me/profile')
  async myProfile(@UserId() id: string): Promise<MyProfile | null> {
    const member = await this.members.get(id);
    return member ? this.members.toMyProfile(member) : null;
  }
}
