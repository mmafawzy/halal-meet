import type {
  Answer,
  CompatibilityResult,
  CompatibilityView,
  Dimension,
  PlanTier,
  ProfileCard,
  PassportBadge,
} from '@halal-meet/core';
import { QUESTIONS, QUESTIONS_BY_KEY, CORE_TOPIC_KEYS, computeCompatibility } from '@halal-meet/core';
import type { Member } from './members';

/**
 * Applies plan gating to a compatibility report (spec 01 §23, spec 04 §2.5):
 * free → overall + top 3 reasons + 1 Discuss flag, dims stripped to timeline/location only, truncated = true.
 * plus/gold/elite → full report.
 */
export function compatibilityView(result: CompatibilityResult, tier: PlanTier): CompatibilityView {
  const full = tier !== 'free';
  const dims: CompatibilityView['dims'] = {};
  if (full) {
    Object.assign(dims, result.dims);
  } else {
    for (const d of ['timeline', 'location'] as Dimension[]) {
      const v = result.dims[d];
      if (v) dims[d] = v;
    }
  }
  return {
    displayPct: result.displayPct,
    dims,
    reasons: full ? result.reasons : result.reasons.slice(0, 3),
    discuss: full ? result.discuss : result.discuss.slice(0, 1),
    truncated: !full,
  };
}

export interface KeyFact {
  questionKey: string;
  value: string;
}

/**
 * "Ask Before You Match" key facts (up to 5): the person's own answers on core topics they marked
 * must/dealbreaker, else the first core-topic answers they have.
 */
export function keyFacts(member: Member): KeyFact[] {
  const byKey = new Map(member.match.answers.map((a) => [a.questionKey, a]));
  const value = (a: Answer): string | null => {
    const v = Array.isArray(a.self) ? (a.self[0] ?? null) : a.self;
    return v;
  };
  const strong: KeyFact[] = [];
  const rest: KeyFact[] = [];
  for (const a of member.match.answers) {
    const v = value(a);
    if (!v) continue;
    const q = QUESTIONS_BY_KEY[a.questionKey];
    if (!q) continue;
    if (q.coreTopic && (a.importance === 'must' || a.importance === 'dealbreaker')) strong.push({ questionKey: a.questionKey, value: v });
    else if (q.coreTopic) rest.push({ questionKey: a.questionKey, value: v });
  }
  const ordered = [...strong, ...rest];
  if (ordered.length >= 5) return ordered.slice(0, 5);
  // Fill up with any other answered question (still the person's own answers).
  const used = new Set(ordered.map((k) => k.questionKey));
  for (const a of member.match.answers) {
    if (ordered.length >= 5) break;
    if (used.has(a.questionKey)) continue;
    const v = value(a);
    if (v) ordered.push({ questionKey: a.questionKey, value: v });
  }
  return ordered.slice(0, 5);
}

export function passportBadge(member: Member): PassportBadge | null {
  const active = member.match.passport.find((d) => d.status === 'active') ?? member.match.passport[0];
  if (!active) return null;
  return {
    homeCountry: member.row.country,
    homeCity: member.row.city,
    destinationCountry: active.country,
    purpose: active.purpose,
    visitFrom: active.visitFrom,
    visitTo: active.visitTo,
  };
}

/** Photo state per the viewer (client shows initials when there is no photo). */
export function photoState(member: Member, viewerIsMatch: boolean): ProfileCard['photoState'] {
  if (!member.row.photoUrl) return 'visible';
  switch (member.row.photoVisibility) {
    case 'public':
      return 'visible';
    case 'matches':
      return viewerIsMatch ? 'visible' : 'blurred';
    case 'request':
      return 'locked';
    case 'family':
      return viewerIsMatch ? 'visible' : 'locked';
    default:
      return 'blurred';
  }
}

export interface CardOptions {
  tier: PlanTier;
  isNew?: boolean;
  sentYouSeriousInterest?: boolean;
  viewerIsMatch?: boolean;
  compat?: CompatibilityResult;
}

export function toProfileCard(member: Member, opts: CardOptions): ProfileCard {
  const compat = opts.compat ?? null;
  return {
    id: member.id,
    firstName: member.row.firstName,
    gender: member.row.gender as ProfileCard['gender'],
    age: member.match.age,
    country: member.row.country,
    city: member.row.city,
    photoUrl: member.row.photoUrl,
    photoState: photoState(member, opts.viewerIsMatch ?? false),
    verifications: member.verifications,
    halalMode: member.row.halalMode as ProfileCard['halalMode'],
    intention: member.row.intention as ProfileCard['intention'],
    maritalStatus: member.row.maritalStatus as ProfileCard['maritalStatus'],
    hasChildren: member.row.hasChildren,
    profession: member.row.profession,
    educationLevel: member.row.educationLevel,
    about: member.row.about,
    languages: member.row.languages,
    passport: passportBadge(member),
    compatibility: compatibilityView(
      compat ?? { overall: 0, displayPct: 0, dims: {}, reasons: [], discuss: [], algoVersion: 'none' },
      opts.tier,
    ),
    keyFacts: keyFacts(member),
    isNew: opts.isNew ?? false,
    sentYouSeriousInterest: opts.sentYouSeriousInterest ?? false,
  };
}

export function coreTopicKeys(): string[] {
  return CORE_TOPIC_KEYS.length ? CORE_TOPIC_KEYS : QUESTIONS.filter((q) => q.coreTopic).map((q) => q.key);
}
