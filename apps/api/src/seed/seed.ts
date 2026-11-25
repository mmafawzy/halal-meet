/**
 * `pnpm --filter @halal-meet/api seed` — wipes and seeds the database.
 *
 * ~800 member profiles across every country in core COUNTRIES (weighted to EG/SA/AE/GB/US/DE/FR/MA),
 * plus two demo accounts:
 *   +201000000001  Ahmed  male    Cairo  free  (has incoming interests and one existing match)
 *   +201000000002  Sara   female  Cairo  free
 * Both log in with the dev OTP code 000000.
 */
import 'reflect-metadata';
import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  QUESTIONS,
  canAnswerSelf,
  canSetPreference,
  type Answer,
  type Gender,
  type HalalMode,
  type Importance,
  type Intention,
  type MaritalStatus,
} from '@halal-meet/core';
import { loadConfig } from '../config';
import { openDatabase, type Db } from '../db/client';
import * as t from '../db/schema';
import { uuidv7 } from '../common/ids';
import { DAY_MS, ageFromBirthDate } from '../common/time';
import { computeProfileStrength } from '../modules/members';
import { CITIES, COUNTRY_WEIGHTS, EDUCATION_LEVELS, FEMALE_NAMES, LANGUAGES, MALE_NAMES, PROFESSIONS, SEEDED_OPEN_COUNTRIES } from './data';

const TARGET_PROFILES = 800;
const NOW = new Date();

/** Deterministic RNG so the seed is reproducible. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let tt = Math.imul(a ^ (a >>> 15), 1 | a);
    tt = (tt + Math.imul(tt ^ (tt >>> 7), 61 | tt)) ^ tt;
    return ((tt ^ (tt >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20261009);
const pick = <T>(list: readonly T[]): T => list[Math.floor(rnd() * list.length)]!;
const pickWeighted = <T extends string>(weights: Record<T, number>): T => {
  const entries = Object.entries(weights) as Array<[T, number]>;
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rnd() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1]![0];
};
const intBetween = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
const chance = (p: number) => rnd() < p;

/** Answer distribution per question (option value → relative weight). */
const WANT: Record<string, Record<string, number>> = {
  prayer: { five_daily: 50, usually: 30, sometimes: 15, rarely: 5 },
  fasting: { ramadan: 45, ramadan_plus: 25, occasionally: 20, not_currently: 10 },
  orientation: { sunni: 72, prefer_not: 14, shia: 7, other: 7 },
  hijab: { hijab: 50, sometimes: 20, no: 18, niqab: 12 },
  beard: { trimmed: 45, full: 35, none: 20 },
  mosque: { jumuah: 40, weekly_plus: 30, occasionally: 20, rarely: 10 },
  music: { some: 45, avoid: 30, comfortable: 25 },
  gender_mixing: { limited: 45, avoid: 30, comfortable: 25 },
  smoking: { never: 60, trying_to_quit: 20, regularly: 20 },
  social_life: { balanced: 45, homebody: 35, very_social: 20 },
  travel: { sometimes: 45, love: 35, rarely: 20 },
  conflict_style: { cool_off: 45, talk_now: 35, involve_family: 20 },
  want_children: { yes: 65, maybe: 25, no: 10 },
  children_count: { '2': 35, '3': 30, '4_plus': 20, '1': 15 },
  children_when: { '1_2_years': 40, asap: 35, '3_plus_years': 25 },
  kids_schooling: { islamic: 35, private: 25, public: 25, flexible: 10, homeschool: 5 },
  living_arrangement: { independent: 45, near_parents: 30, flexible: 15, with_parents: 10 },
  parents_involvement: { moderate: 45, high: 30, low: 25 },
  family_visits: { weekly: 40, monthly: 40, occasionally: 20 },
  wedding_size: { medium: 45, small: 35, large: 20 },
  spouses_working: { flexible: 30, both: 25, wife_choice: 25, husband_only: 20 },
  household_roles: { shared: 45, traditional: 30, flexible: 25 },
  career_ambition: { balanced: 45, family_first: 30, very_high: 25 },
  finances: { joint: 40, mixed: 35, separate: 25 },
  saving_spending: { balanced: 45, saver: 35, spender: 20 },
  debt_attitude: { islamic_finance: 40, avoid_all: 35, flexible: 25 },
  relocation: { within_country: 45, anywhere: 35, no: 20 },
};

const DEALBREAKER_QUESTIONS = new Set(['prayer', 'want_children', 'smoking', 'relocation']);

function randomAnswers(gender: Gender): Answer[] {
  const out: Answer[] = [];
  for (const q of QUESTIONS) {
    const weights = WANT[q.key];
    const self = canAnswerSelf(q, gender) && weights ? pickWeighted(weights) : null;
    let accept: string[] | null = null;
    if (canSetPreference(q, gender) && chance(0.7)) {
      const options = q.options.map((o) => o.value);
      const base = weights ? pickWeighted(weights) : pick(options);
      // Accept the chosen value plus a couple of neighbouring options (keeps the pool large).
      const extras = options.filter((v) => v !== base);
      const shuffled = [...extras].sort(() => rnd() - 0.5);
      accept = [base, ...shuffled.slice(0, Math.min(2, Math.max(0, Math.floor(rnd() * 3))))];
      if (chance(0.12)) accept = options; // "open to anything"
    }
    const roll = rnd();
    let importance: Importance = 'important';
    if (roll < 0.25) importance = 'flexible';
    else if (roll < 0.37) importance = 'must';
    else if (roll < 0.41 && DEALBREAKER_QUESTIONS.has(q.key) && accept && accept.length >= 3) importance = 'dealbreaker';
    out.push({ questionKey: q.key, self, accept, importance });
  }
  return out;
}

function birthDateForAge(age: number): string {
  const d = new Date(NOW.getTime() - (age * 365.25 + intBetween(0, 300)) * DAY_MS);
  return d.toISOString().slice(0, 10);
}

function weightedCountries(count: number): string[] {
  const entries = Object.entries(COUNTRY_WEIGHTS);
  const total = entries.reduce((s, [, w]) => s + w, 0);
  const out: string[] = [];
  for (const [code, w] of entries) {
    const n = Math.round((count * w) / total);
    for (let i = 0; i < n; i++) out.push(code);
  }
  while (out.length < count) out.push('EG');
  return out.slice(0, count);
}

interface SeedProfile {
  id: string;
  phone: string;
  firstName: string;
  gender: Gender;
  age: number;
  country: string;
  city: string;
  verified: boolean;
  answers: Answer[];
  intention: Intention;
  halalMode: HalalMode;
  acceptedModes: HalalMode[];
  maritalStatus: MaritalStatus;
  hasChildren: boolean;
  languages: string[];
  ageMin: number;
  ageMax: number;
  verifiedOnly: boolean;
  acceptChildren: boolean;
  openToRelocate: boolean;
  relocateCountries: string[];
  photoVisibility: 'public' | 'matches' | 'request' | 'family';
  intlVisibility: 'on' | 'relocating_only' | 'off';
}

function makeProfile(opts: { country: string; gender: Gender; index: number; demo?: boolean }): SeedProfile {
  const { country, gender, index } = opts;
  const age = intBetween(21, 45);
  const maritalStatus: MaritalStatus = pickWeighted<'never_married' | 'divorced' | 'widowed' | 'annulled'>({
    never_married: 74,
    divorced: 20,
    widowed: 4,
    annulled: 2,
  });
  const hasChildren = maritalStatus === 'never_married' ? false : chance(0.6);
  const intention: Intention = pickWeighted<Intention>({
    within_1y: 45,
    within_6m: 18,
    serious_getting_to_know: 15,
    within_2y: 14,
    unsure: 8,
  });
  const halalMode: HalalMode = pickWeighted<HalalMode>({ guided: 45, private: 35, wali: 20 });
  const acceptedModes: HalalMode[] = chance(0.85)
    ? ['private', 'guided', 'wali']
    : chance(0.5)
      ? ['private', 'guided']
      : ['guided', 'wali'];
  const localLangs = LANGUAGES[country] ?? ['ar', 'en'];
  const languages = [localLangs[0]!, ...localLangs.slice(1).filter(() => chance(0.55))];
  if (!languages.includes('en') && chance(0.5)) languages.push('en');
  return {
    id: uuidv7(),
    phone: `+2${String(100000000 + index).slice(0, 9)}`,
    firstName: gender === 'male' ? pick(MALE_NAMES) : pick(FEMALE_NAMES),
    gender,
    age,
    country,
    city: pick(CITIES[country] ?? ['Cairo']),
    verified: chance(0.7),
    answers: randomAnswers(gender),
    intention,
    halalMode,
    acceptedModes,
    maritalStatus,
    hasChildren,
    languages: [...new Set(languages)],
    ageMin: Math.max(18, age - intBetween(6, 12)),
    ageMax: Math.min(60, age + intBetween(6, 14)),
    verifiedOnly: gender === 'female' ? chance(0.75) : chance(0.25),
    acceptChildren: maritalStatus === 'never_married' ? chance(0.9) : true,
    openToRelocate: chance(0.35),
    relocateCountries: [],
    photoVisibility: pickWeighted({ matches: 55, public: 25, request: 15, family: 5 }),
    intlVisibility: pickWeighted({ on: 70, relocating_only: 20, off: 10 }),
  };
}

// ───────── Writers ─────────

async function wipe(db: Db): Promise<void> {
  await db.execute(sql`
    TRUNCATE TABLE
      topic_answers, topic_coverage, messages, stage_readiness, matches,
      interests, passes, blocks, reports, top_picks, feed_impressions,
      passport_destinations, purchases, subscriptions, usage_events,
      answers, match_preferences, verifications, country_status_overrides,
      profiles, accounts
    RESTART IDENTITY CASCADE
  `);
}

async function insertProfiles(db: Db, profiles: SeedProfile[]): Promise<void> {
  const accounts = profiles.map((p) => ({
    id: p.id,
    phoneE164: p.phone,
    locale: chance(0.6) ? 'ar' : 'en',
    status: 'active',
    role: 'member',
    createdAt: new Date(NOW.getTime() - intBetween(0, 120) * DAY_MS),
    lastActiveAt: new Date(NOW.getTime() - intBetween(0, 14) * DAY_MS),
  }));
  const rows = profiles.map((p) => {
    const birthDate = birthDateForAge(p.age);
    const base = {
      accountId: p.id,
      firstName: p.firstName,
      gender: p.gender,
      birthDate,
      nationality: [p.country],
      country: p.country,
      city: p.city,
      languages: p.languages,
      heightCm: p.gender === 'male' ? intBetween(165, 190) : intBetween(152, 175),
      maritalStatus: p.maritalStatus,
      hasChildren: p.hasChildren,
      educationLevel: pick(EDUCATION_LEVELS),
      profession: pick(PROFESSIONS),
      intention: p.intention,
      halalMode: p.halalMode,
      acceptedModes: p.acceptedModes,
      about: aboutText(p),
      photoUrl: null,
      photoVisibility: p.photoVisibility,
      openToRelocate: p.openToRelocate,
      relocateCountries: p.relocateCountries,
      intlVisibility: p.intlVisibility,
      createdAt: new Date(NOW.getTime() - intBetween(0, 120) * DAY_MS),
      updatedAt: NOW,
    };
    return {
      ...base,
      profileStrength: computeProfileStrength({ ...base, profileStrength: 0 } as never, p.answers.length, p.verified ? ['phone', 'identity'] : ['phone']),
    };
  });

  await chunked(accounts, 400, (batch) => db.insert(t.accounts).values(batch));
  await chunked(rows, 400, (batch) => db.insert(t.profiles).values(batch));
  await chunked(
    profiles.map((p) => ({ id: uuidv7(), accountId: p.id, kind: 'phone', status: 'approved', vendor: 'otp', decidedAt: NOW })),
    400,
    (batch) => db.insert(t.verifications).values(batch),
  );
  await chunked(
    profiles
      .filter((p) => p.verified)
      .map((p) => ({ id: uuidv7(), accountId: p.id, kind: 'identity', status: 'approved', vendor: 'seed', decidedAt: NOW })),
    400,
    (batch) => db.insert(t.verifications).values(batch),
  );
  await chunked(
    profiles
      .filter((p) => chance(0.4))
      .map((p) => ({ id: uuidv7(), accountId: p.id, kind: chance(0.5) ? 'profession' : 'education', status: 'approved', vendor: 'seed', decidedAt: NOW })),
    400,
    (batch) => db.insert(t.verifications).values(batch),
  );
  await chunked(
    profiles.map((p) => ({
      accountId: p.id,
      ageMin: p.ageMin,
      ageMax: p.ageMax,
      maritalStatuses: null,
      acceptChildren: p.acceptChildren,
      verifiedOnly: p.verifiedOnly,
      languages: null,
      dimensionImportance: {},
    })),
    400,
    (batch) => db.insert(t.matchPreferences).values(batch),
  );
  await chunked(
    profiles.flatMap((p) => p.answers.map((a) => ({ accountId: p.id, questionKey: a.questionKey, selfValue: a.self, partnerAccept: a.accept, importance: a.importance, answeredAt: NOW }))),
    500,
    (batch) => db.insert(t.answers).values(batch),
  );
}

function aboutText(p: SeedProfile): string {
  const openers = [
    `I'm ${p.firstName}, based in ${p.city}. I work as ${pick(PROFESSIONS).toLowerCase()} and try to keep my deen at the centre of my life.`,
    `Assalamu alaikum — ${p.firstName} from ${p.city}. Family means a lot to me and I'm looking for a marriage built on respect and mercy.`,
    `I live in ${p.city} and value honesty, patience and a calm home.`,
  ];
  const middles = [
    'I pray as often as I can and I want a home where we grow closer to Allah together.',
    'I enjoy reading, cooking and long walks with family. I would like a partner I can talk to about everything.',
    'I take my work seriously but my family comes first. I am looking for someone kind and grounded.',
  ];
  return `${pick(openers)} ${pick(middles)}`;
}

async function chunked<T>(items: T[], size: number, write: (batch: T[]) => Promise<unknown>): Promise<void> {
  for (let i = 0; i < items.length; i += size) {
    await write(items.slice(i, i + size));
  }
}

async function main(): Promise<void> {
  const config = loadConfig();
  const handle = await openDatabase({ url: config.databaseUrl, dataDir: config.databaseUrl ? null : config.pgliteDir });
  const db = handle.db;

  console.log('[seed] wiping tables…');
  await wipe(db);

  // ───────── Country status overrides (density is too small in a seed for real 'open' status) ─────────
  await db.insert(t.countryStatusOverrides).values(SEEDED_OPEN_COUNTRIES.map((code) => ({ code, status: 'open' })));

  // ───────── Members ─────────
  const countries = weightedCountries(TARGET_PROFILES);
  const profiles: SeedProfile[] = countries.map((country, i) => makeProfile({ country, gender: i % 2 === 0 ? 'female' : 'male', index: i + 10 }));

  const ahmed = makeProfile({ country: 'EG', gender: 'male', index: 1, demo: true });
  Object.assign(ahmed, {
    firstName: 'Ahmed',
    age: 30,
    city: 'Cairo',
    phone: '+201000000001',
    verified: true,
    intention: 'within_1y' as Intention,
    halalMode: 'guided' as HalalMode,
    maritalStatus: 'never_married' as MaritalStatus,
    hasChildren: false,
    languages: ['ar', 'en'],
    ageMin: 21,
    ageMax: 34,
    verifiedOnly: false,
    acceptChildren: true,
    openToRelocate: true,
    photoVisibility: 'matches' as const,
    intlVisibility: 'on' as const,
    profession: 'Software engineer',
    educationLevel: 'bachelor',
    about:
      'I am Ahmed from Cairo. I work as a software engineer and I try to pray on time and keep good ties with my family. I am looking for a calm, kind partner who wants to build an Islamic home together and grow in deen.',
  });
  const sara = makeProfile({ country: 'EG', gender: 'female', index: 2, demo: true });
  Object.assign(sara, {
    firstName: 'Sara',
    age: 27,
    city: 'New Cairo',
    phone: '+201000000002',
    verified: true,
    intention: 'within_1y' as Intention,
    halalMode: 'guided' as HalalMode,
    maritalStatus: 'never_married' as MaritalStatus,
    hasChildren: false,
    languages: ['ar', 'en', 'fr'],
    ageMin: 26,
    ageMax: 36,
    verifiedOnly: true,
    acceptChildren: true,
    openToRelocate: true,
    photoVisibility: 'matches' as const,
    intlVisibility: 'on' as const,
    profession: 'Pharmacist',
    educationLevel: 'master',
    about:
      'I am Sara, a pharmacist in New Cairo. I love reading and I value honesty and patience above everything. I want a marriage where we support each other in worship and in life.',
  });

  const all = [ahmed, sara, ...profiles];
  console.log(`[seed] inserting ${all.length} members…`);
  await insertProfiles(db, all);

  // ───────── Passport (≈5% of members, mix of relocate/visiting with Travel-mode dates) ─────────
  const passportHolders = all.filter((p) => p.id !== ahmed.id && p.id !== sara.id && chance(0.05));
  const destinations: Array<typeof t.passportDestinations.$inferInsert> = [];
  for (const holder of passportHolders) {
    const destination = pick(Object.keys(COUNTRY_WEIGHTS).filter((c) => c !== holder.country));
    const purpose = pick(['relocate', 'moving', 'visiting', 'either'] as const);
    const visiting = purpose === 'visiting';
    const visitFrom = visiting ? new Date(NOW.getTime() + intBetween(-10, 40) * DAY_MS) : null;
    const visitTo = visiting && visitFrom ? new Date(visitFrom.getTime() + intBetween(5, 20) * DAY_MS) : null;
    const visibleFrom = visitFrom ? new Date(visitFrom.getTime() - 14 * DAY_MS) : NOW;
    destinations.push({
      id: uuidv7(),
      accountId: holder.id,
      country: destination,
      city: pick(CITIES[destination] ?? [destination]),
      isWorldwide: false,
      purpose,
      visitFrom: visitFrom ? visitFrom.toISOString().slice(0, 10) : null,
      visitTo: visitTo ? visitTo.toISOString().slice(0, 10) : null,
      visibleFrom,
      activeUntil: visitTo ?? new Date(NOW.getTime() + 30 * DAY_MS),
      status: visibleFrom > NOW ? 'scheduled' : 'active',
      source: 'pass',
    });
    // A live 7-day Passport pass is what entitles them (capacity 1).
    await db.insert(t.purchases).values({
      id: uuidv7(),
      accountId: holder.id,
      sku: 'passport_pass_7d',
      store: 'seed',
      amountMinor: 499,
      currency: 'USD',
      status: 'fulfilled',
      fulfilledAt: new Date(NOW.getTime() - DAY_MS),
      expiresAt: new Date(NOW.getTime() + 6 * DAY_MS),
    });
  }
  await chunked(destinations, 200, (batch) => db.insert(t.passportDestinations).values(batch));
  console.log(`[seed] ${passportHolders.length} Passport holders`);

  // ───────── Incoming interests for the male demo + one existing match with messages ─────────
  const egyptianWomen = all.filter((p) => p.gender === 'female' && p.country === 'EG' && p.id !== sara.id);
  const interested = egyptianWomen.slice(0, 6);
  for (const [i, woman] of interested.entries()) {
    await db.insert(t.interests).values({
      id: uuidv7(),
      fromId: woman.id,
      toId: ahmed.id,
      level: i < 2 ? 'serious' : 'interest',
      note: i === 0 ? 'Your answer about family closeness resonated with me.' : null,
      status: 'pending',
      createdAt: new Date(NOW.getTime() - intBetween(1, 10) * DAY_MS),
    });
  }
  // Sara has also sent Ahmed a (plain) interest, and he reciprocated → existing match.
  await db.insert(t.interests).values({ id: uuidv7(), fromId: sara.id, toId: ahmed.id, level: 'interest', status: 'matched', note: null, createdAt: new Date(NOW.getTime() - 5 * DAY_MS) });
  await db.insert(t.interests).values({ id: uuidv7(), fromId: ahmed.id, toId: sara.id, level: 'interest', status: 'matched', note: null, createdAt: new Date(NOW.getTime() - 5 * DAY_MS) });
  await db.insert(t.usageEvents).values([
    { id: randomUUID(), accountId: ahmed.id, kind: 'interest', at: new Date(NOW.getTime() - 5 * DAY_MS) },
    { id: randomUUID(), accountId: ahmed.id, kind: 'serious', at: new Date(NOW.getTime() - 6 * DAY_MS) },
  ]);

  const matchId = uuidv7();
  await db.insert(t.matches).values({
    id: matchId,
    aId: sara.id,
    bId: ahmed.id,
    stage: 2,
    status: 'active',
    firstMessageDue: new Date(NOW.getTime() + 2 * DAY_MS),
    createdAt: new Date(NOW.getTime() - 4 * DAY_MS),
    updatedAt: new Date(NOW.getTime() - DAY_MS),
  });
  const conversation: Array<typeof t.messages.$inferInsert> = [
    { id: uuidv7(), matchId, senderId: sara.id, kind: 'text', body: 'Assalamu alaikum Ahmed, thank you for reaching out. How is your week going?', sentAt: new Date(NOW.getTime() - 4 * DAY_MS) },
    { id: uuidv7(), matchId, senderId: ahmed.id, kind: 'text', body: 'Wa alaikum assalam Sara. Alhamdulillah, a good week. I read your profile and I liked how you described family life.', sentAt: new Date(NOW.getTime() - 3 * DAY_MS) },
    { id: uuidv7(), matchId, senderId: sara.id, kind: 'text', body: 'That is kind of you. Where do you see yourself living after marriage, Cairo or abroad?', sentAt: new Date(NOW.getTime() - 3 * DAY_MS + 3_600_000) },
  ];
  const topicCardId = uuidv7();
  conversation.push({
    id: topicCardId,
    matchId,
    senderId: ahmed.id,
    kind: 'topic_card',
    body: 'Do you want children?',
    topicKey: 'want_children',
    sentAt: new Date(NOW.getTime() - 2 * DAY_MS),
  });
  conversation.push({ id: uuidv7(), matchId, senderId: ahmed.id, kind: 'text', body: 'I would like us to go through the marriage topics properly, inshaAllah.', sentAt: new Date(NOW.getTime() - DAY_MS) });
  await db.insert(t.messages).values(conversation);
  await db.insert(t.topicAnswers).values({ messageId: topicCardId, accountId: ahmed.id, value: 'yes', answeredAt: new Date(NOW.getTime() - 2 * DAY_MS) });

  // A couple of passes so the exclusion logic has data.
  if (egyptianWomen[6]) {
    await db.insert(t.passes).values({ fromId: ahmed.id, toId: egyptianWomen[6]!.id, reason: 'not_a_fit', undone: false, createdAt: new Date(NOW.getTime() - 2 * DAY_MS) }).onConflictDoNothing();
  }

  const countRows = await db.select({ n: sql<number>`count(*)` }).from(t.profiles);
  const verifiedRows = await db
    .select({ n: sql<number>`count(*)` })
    .from(t.verifications)
    .where(eq(t.verifications.kind, 'identity'));
  const count = Number(countRows[0]?.n ?? 0);
  const verified = Number(verifiedRows[0]?.n ?? 0);
  console.log(`[seed] done: ${count} profiles (${verified} identity-verified), ${destinations.length} passport destinations, match=${matchId}`);
  console.log('[seed] demo logins: +201000000001 (male, Cairo, free) and +201000000002 (female, Cairo, free), OTP code 000000');

  await handle.close();
  void inArray;
  void ageFromBirthDate;
}

main().catch((e) => {
  console.error('[seed] failed', e);
  process.exitCode = 1;
});
