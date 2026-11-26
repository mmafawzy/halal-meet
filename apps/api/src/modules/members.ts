import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, ne, or, type SQL } from 'drizzle-orm';
import {
  canAnswerSelf,
  canSetPreference,
  QUESTIONS,
  QUESTIONS_BY_KEY,
  STARTER_QUESTION_KEYS,
  type Answer,
  type Gender,
  type MatchPreferences,
  type MatchProfile,
  type MyProfile,
  type PassportDestination,
  type ProfileInput,
  type VerificationKind,
} from '@halal-meet/core';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { ageFromBirthDate } from '../common/time';
import { EntitlementsService } from './entitlements';
import { groupBy, uniq } from '../common/collections';
import { loadPhotoSummaries, ownMainPhoto, photoPath, type MemberPhoto } from './photo-access';
export { groupBy, uniq } from '../common/collections';

export type ProfileRow = typeof t.profiles.$inferSelect;

/** Everything the server knows about one member, as needed by matching + card rendering. */
export interface Member {
  id: string;
  row: ProfileRow;
  match: MatchProfile;
  verifications: VerificationKind[];
  createdAt: Date;
  lastActiveAt: Date | null;
  status: string;
  /** Non-rejected photos, main first (photos workstream; see photo-access.ts). */
  photos?: MemberPhoto[];
}

/** The owner's main photo as a URL bound to the owner (made absolute by the photo interceptor). */
function ownPhotoUrl(m: Member): string | null {
  const main = ownMainPhoto(m.photos);
  return main ? photoPath(m.id, main.id) : null;
}

export function defaultPreferences(gender: Gender, age: number): MatchPreferences {
  return {
    ageMin: Math.max(18, age - 8),
    ageMax: Math.max(age + 8, 25),
    maritalStatuses: null,
    acceptChildren: true,
    // Spec 04 §1: verified-only defaults on for women seeking men.
    verifiedOnly: gender === 'female',
    languages: null,
  };
}

export function derivePassportStatus(d: Omit<PassportDestination, 'status'> & { status: string }, now: Date): PassportDestination['status'] {
  if (d.status === 'cancelled') return 'cancelled';
  if (d.activeUntil && new Date(d.activeUntil) < now) return 'expired';
  if (new Date(d.visibleFrom) > now) return 'scheduled';
  return 'active';
}

export function toPassportDestination(r: typeof t.passportDestinations.$inferSelect, now: Date): PassportDestination {
  const base = {
    id: r.id,
    country: r.country,
    city: r.city,
    purpose: r.purpose as PassportDestination['purpose'],
    visitFrom: r.visitFrom,
    visitTo: r.visitTo,
    visibleFrom: r.visibleFrom.toISOString(),
    activeUntil: r.activeUntil ? r.activeUntil.toISOString() : null,
    isWorldwide: r.isWorldwide,
    status: r.status,
  };
  return { ...base, status: derivePassportStatus(base, now) };
}

function rowToAnswer(r: typeof t.answers.$inferSelect): Answer {
  return { questionKey: r.questionKey, self: r.selfValue ?? null, accept: r.partnerAccept ?? null, importance: r.importance };
}

/** Profile strength heuristic (0..100): basics, optional details, answered questions, verification. */
export function computeProfileStrength(row: ProfileRow, answersCount: number, verifications: VerificationKind[]): number {
  let s = 30; // required basics are always present once a profile exists
  if (row.about && row.about.trim().length >= 50) s += 10;
  else if (row.about && row.about.trim().length > 0) s += 4;
  if (row.profession) s += 5;
  if (row.educationLevel) s += 5;
  if (row.heightCm) s += 3;
  if (row.photoUrl) s += 10;
  if (row.languages.length >= 2) s += 2;
  s += Math.round(25 * Math.min(1, answersCount / QUESTIONS.length));
  if (verifications.includes('identity')) s += 10;
  return Math.min(100, s);
}

/** Drops answer halves the user's gender may not set (hijab self only for women, beard self only for men, etc.). */
export function sanitizeAnswer(a: Answer, gender: Gender): Answer | null {
  const q = QUESTIONS_BY_KEY[a.questionKey];
  if (!q) return null;
  const valid = new Set(q.options.map((o) => o.value));
  let self = canAnswerSelf(q, gender) ? a.self : null;
  if (Array.isArray(self)) self = self.filter((v) => valid.has(v));
  else if (typeof self === 'string' && !valid.has(self)) self = null;
  if (Array.isArray(self) && self.length === 0) self = null;
  let accept = canSetPreference(q, gender) ? a.accept : null;
  if (accept) accept = accept.filter((v) => valid.has(v));
  if (accept && accept.length === 0) accept = null;
  return { questionKey: q.key, self, accept, importance: a.importance };
}

@Injectable()
export class MembersService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(EntitlementsService) private readonly entitlements: EntitlementsService,
  ) {}

  /** Loads members matching `where` (on profiles/accounts) with answers, preferences, verifications and entitled Passports. */
  async load(where: SQL | undefined, now = new Date()): Promise<Member[]> {
    const rows = await this.db
      .select({ p: t.profiles, a: { createdAt: t.accounts.createdAt, lastActiveAt: t.accounts.lastActiveAt, status: t.accounts.status } })
      .from(t.profiles)
      .innerJoin(t.accounts, eq(t.accounts.id, t.profiles.accountId))
      .where(where);
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.p.accountId);

    const [answerRows, prefRows, verRows, passRows] = await Promise.all([
      this.db.select().from(t.answers).where(inArray(t.answers.accountId, ids)),
      this.db.select().from(t.matchPreferences).where(inArray(t.matchPreferences.accountId, ids)),
      this.db
        .select({ accountId: t.verifications.accountId, kind: t.verifications.kind })
        .from(t.verifications)
        .where(and(inArray(t.verifications.accountId, ids), eq(t.verifications.status, 'approved'))),
      this.db
        .select()
        .from(t.passportDestinations)
        .where(
          and(
            inArray(t.passportDestinations.accountId, ids),
            ne(t.passportDestinations.status, 'cancelled'),
            or(isNull(t.passportDestinations.activeUntil), gt(t.passportDestinations.activeUntil, now)),
          ),
        ),
    ]);

    const answersBy = groupBy(answerRows, (r) => r.accountId);
    const prefsBy = new Map(prefRows.map((r) => [r.accountId, r]));
    const verBy = groupBy(verRows, (r) => r.accountId);
    const passBy = groupBy(passRows, (r) => r.accountId);

    // Passport destinations only count while the holder is entitled (spec: "only if entitled").
    const capacityBy = await this.entitlements.passportCapacities([...passBy.keys()], now);
    const photosBy = await loadPhotoSummaries(this.db, ids);

    return rows.map(({ p, a }) => {
      const age = ageFromBirthDate(p.birthDate, now);
      const pref = prefsBy.get(p.accountId);
      const verifications = uniq(['phone', ...(verBy.get(p.accountId) ?? []).map((v) => v.kind)]) as VerificationKind[];
      const capacity = capacityBy.get(p.accountId) ?? 0;
      const passport = (passBy.get(p.accountId) ?? [])
        .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())
        .slice(0, capacity)
        .map((d) => toPassportDestination(d, now));
      const match: MatchProfile = {
        id: p.accountId,
        gender: p.gender as Gender,
        age,
        country: p.country,
        city: p.city,
        languages: p.languages,
        maritalStatus: p.maritalStatus as MatchProfile['maritalStatus'],
        hasChildren: p.hasChildren,
        intention: p.intention as MatchProfile['intention'],
        halalMode: p.halalMode as MatchProfile['halalMode'],
        acceptedModes: p.acceptedModes as MatchProfile['acceptedModes'],
        identityVerified: verifications.includes('identity'),
        openToRelocate: p.openToRelocate,
        relocateCountries: p.relocateCountries,
        intlVisibility: p.intlVisibility as MatchProfile['intlVisibility'],
        answers: (answersBy.get(p.accountId) ?? []).map(rowToAnswer),
        dimensionImportance: pref?.dimensionImportance ?? {},
        preferences: pref
          ? {
              ageMin: pref.ageMin,
              ageMax: pref.ageMax,
              maritalStatuses: (pref.maritalStatuses as MatchPreferences['maritalStatuses']) ?? null,
              acceptChildren: pref.acceptChildren,
              verifiedOnly: pref.verifiedOnly,
              languages: pref.languages ?? null,
            }
          : defaultPreferences(p.gender as Gender, age),
        passport,
      };
      return { id: p.accountId, row: p, match, verifications, createdAt: a.createdAt, lastActiveAt: a.lastActiveAt, status: a.status, photos: photosBy.get(p.accountId) ?? [] };
    });
  }

  async get(id: string, now = new Date()): Promise<Member | null> {
    const [m] = await this.load(eq(t.profiles.accountId, id), now);
    return m ?? null;
  }

  async getMany(ids: string[], now = new Date()): Promise<Map<string, Member>> {
    if (ids.length === 0) return new Map();
    const list = await this.load(inArray(t.profiles.accountId, uniq(ids)), now);
    return new Map(list.map((m) => [m.id, m]));
  }

  toMyProfile(m: Member): MyProfile {
    const r = m.row;
    const input: ProfileInput = {
      firstName: r.firstName,
      gender: r.gender as Gender,
      birthDate: r.birthDate,
      nationality: r.nationality,
      country: r.country,
      city: r.city,
      languages: r.languages,
      heightCm: r.heightCm,
      maritalStatus: r.maritalStatus as ProfileInput['maritalStatus'],
      hasChildren: r.hasChildren,
      educationLevel: r.educationLevel,
      profession: r.profession,
      intention: r.intention as ProfileInput['intention'],
      halalMode: r.halalMode as ProfileInput['halalMode'],
      acceptedModes: r.acceptedModes as ProfileInput['acceptedModes'],
      about: r.about,
      photoVisibility: r.photoVisibility as ProfileInput['photoVisibility'],
      openToRelocate: r.openToRelocate,
      relocateCountries: r.relocateCountries,
      intlVisibility: r.intlVisibility as ProfileInput['intlVisibility'],
    };
    return { ...input, id: m.id, age: m.match.age, photoUrl: ownPhotoUrl(m), verifications: m.verifications, profileStrength: r.profileStrength };
  }

  /** Recomputes and stores the cached profile strength. */
  async refreshStrength(accountId: string): Promise<void> {
    const m = await this.get(accountId);
    if (!m) return;
    const strength = computeProfileStrength(m.row, m.match.answers.length, m.verifications);
    if (strength !== m.row.profileStrength) {
      await this.db.update(t.profiles).set({ profileStrength: strength }).where(eq(t.profiles.accountId, accountId));
    }
  }

  isOnboardingComplete(m: Member | null): boolean {
    if (!m) return false;
    const answered = new Set(m.match.answers.map((a) => a.questionKey));
    return STARTER_QUESTION_KEYS.every((k) => answered.has(k));
  }
}

