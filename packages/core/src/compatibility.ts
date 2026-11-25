import { QUESTIONS, QUESTIONS_BY_KEY, type QuestionDef } from './questions';
import type {
  Answer,
  CompatibilityResult,
  Dimension,
  DimensionScore,
  DiscussFlag,
  Importance,
  Intention,
  MatchProfile,
  ReasonCode,
} from './types';

export const ALGO_VERSION = 'compat-v1.0';

export const IMPORTANCE_WEIGHT: Record<Importance, number> = {
  dealbreaker: 6,
  must: 4,
  important: 2,
  flexible: 0.5,
};

/** Shared answers needed in a dimension before it is revealed in the "Why we match" report. */
export const REVEAL_THRESHOLD: Partial<Record<Dimension, number>> = {
  religion: 3,
  family: 2,
  children: 2,
  lifestyle: 2,
  finance: 2,
  career: 2,
};

const QUESTION_DIMENSIONS: Dimension[] = ['religion', 'family', 'children', 'lifestyle', 'finance', 'career'];
const INTENTION_ORDER: Intention[] = ['within_6m', 'within_1y', 'within_2y', 'serious_getting_to_know', 'unsure'];

/** Pseudo question keys for derived dimensions, used in reason codes. */
export const DERIVED_KEYS = { timeline: '_timeline', location: '_location', language: '_language' } as const;

function answerMap(p: MatchProfile): Map<string, Answer> {
  return new Map(p.answers.map((a) => [a.questionKey, a]));
}

function asArray(v: string | string[] | null | undefined): string[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}

function optionIndex(q: QuestionDef, value: string): number {
  return q.options.findIndex((o) => o.value === value);
}

function partialCredit(q: QuestionDef, a: string, b: string): number {
  if (a === b) return 1;
  return q.partial?.[a]?.[b] ?? q.partial?.[b]?.[a] ?? 0;
}

/** Similarity of one viewer value/accept set against a single candidate value. */
function satisfactionForValue(q: QuestionDef, viewer: Answer, candidateValue: string): number | undefined {
  const accept = viewer.accept && viewer.accept.length > 0 ? viewer.accept : null;
  const reference = accept ?? asArray(viewer.self);
  if (reference.length === 0) return undefined;

  if (q.type === 'ordinal') {
    const n = q.options.length;
    const ib = optionIndex(q, candidateValue);
    if (ib < 0 || n < 2) return undefined;
    if (accept && accept.includes(candidateValue)) return 1;
    const minDistance = Math.min(...reference.map((v) => Math.abs(optionIndex(q, v) - ib)));
    return Math.max(0, 1 - minDistance / (n - 1));
  }

  if (accept && accept.includes(candidateValue)) return 1;
  return Math.max(...reference.map((v) => partialCredit(q, v, candidateValue)));
}

/**
 * How satisfied `viewer` is with `candidate` on question `q` (0..1), or undefined when there is no data
 * (candidate has no self answer, or viewer has neither a preference nor an own answer).
 */
export function satisfaction(q: QuestionDef, viewer: Answer | undefined, candidate: Answer | undefined): number | undefined {
  if (!viewer || !candidate) return undefined;
  const values = asArray(candidate.self);
  if (values.length === 0) return undefined;
  const scores = values
    .map((v) => satisfactionForValue(q, viewer, v))
    .filter((s): s is number => s !== undefined);
  return scores.length ? Math.max(...scores) : undefined;
}

export function timelineScore(a: Intention, b: Intention): number {
  const d = Math.abs(INTENTION_ORDER.indexOf(a) - INTENTION_ORDER.indexOf(b));
  return Math.max(0, 1 - d * 0.25);
}

export function languageScore(a: MatchProfile, b: MatchProfile): number {
  return a.languages.some((l) => b.languages.includes(l)) ? 1 : 0.3;
}

/** Derived location fit, taking Passport purpose and relocation willingness into account. */
export function locationScore(a: MatchProfile, b: MatchProfile): number {
  if (a.country === b.country) return a.city === b.city ? 1 : 0.85;
  const relocating = (from: MatchProfile, to: MatchProfile) =>
    from.passport.some(
      (d) => (d.country === to.country || d.isWorldwide) && ['relocate', 'moving', 'either'].includes(d.purpose),
    ) ||
    (from.openToRelocate && (from.relocateCountries.length === 0 || from.relocateCountries.includes(to.country)));
  if (relocating(a, b) || relocating(b, a)) return 0.8;
  const visiting = [...a.passport, ...b.passport].some((d) => d.purpose === 'visiting');
  return visiting ? 0.4 : 0.3;
}

interface Directional {
  sum: number;
  weight: number;
}

/** Computes mutual compatibility between two members. Symmetric: compute(a,b).overall === compute(b,a).overall. */
export function computeCompatibility(a: MatchProfile, b: MatchProfile): CompatibilityResult {
  const aAnswers = answerMap(a);
  const bAnswers = answerMap(b);

  const ab: Partial<Record<Dimension, Directional>> = {};
  const ba: Partial<Record<Dimension, Directional>> = {};
  const shared: Partial<Record<Dimension, number>> = {};
  const reasons: ReasonCode[] = [];
  const discuss: DiscussFlag[] = [];

  const add = (acc: Partial<Record<Dimension, Directional>>, d: Dimension, s: number, w: number) => {
    const cur = acc[d] ?? { sum: 0, weight: 0 };
    cur.sum += s * w;
    cur.weight += w;
    acc[d] = cur;
  };

  for (const q of QUESTIONS) {
    const aAns = aAnswers.get(q.key);
    const bAns = bAnswers.get(q.key);
    if (!aAns || !bAns) continue;

    const sAB = satisfaction(q, aAns, bAns);
    const sBA = satisfaction(q, bAns, aAns);
    if (sAB === undefined && sBA === undefined) continue;

    const wA = IMPORTANCE_WEIGHT[aAns.importance];
    const wB = IMPORTANCE_WEIGHT[bAns.importance];
    if (sAB !== undefined) add(ab, q.dimension, sAB, wA);
    if (sBA !== undefined) add(ba, q.dimension, sBA, wB);
    shared[q.dimension] = (shared[q.dimension] ?? 0) + 1;

    const defined = [sAB, sBA].filter((s): s is number => s !== undefined);
    const minS = Math.min(...defined);
    const maxW = Math.max(sAB !== undefined ? wA : 0, sBA !== undefined ? wB : 0);
    const aVal = asArray(aAns.self)[0] ?? null;
    const bVal = asArray(bAns.self)[0] ?? null;

    if (minS >= 0.9 && maxW >= 2) {
      reasons.push({ questionKey: q.key, value: aVal !== null && aVal === bVal ? aVal : null, dimension: q.dimension, weight: wA + wB });
    } else if (minS < 0.5 && maxW >= 2) {
      discuss.push({ questionKey: q.key, dimension: q.dimension, aValue: aVal, bValue: bVal });
    }
  }

  const dims: Partial<Record<Dimension, DimensionScore>> = {};
  const directionalDims: { ab: Partial<Record<Dimension, number>>; ba: Partial<Record<Dimension, number>> } = { ab: {}, ba: {} };

  for (const d of QUESTION_DIMENSIONS) {
    const x = ab[d];
    const y = ba[d];
    const sx = x && x.weight > 0 ? x.sum / x.weight : undefined;
    const sy = y && y.weight > 0 ? y.sum / y.weight : undefined;
    if (sx === undefined && sy === undefined) continue;
    if (sx !== undefined) directionalDims.ab[d] = sx;
    if (sy !== undefined) directionalDims.ba[d] = sy;
    const mutual = sx !== undefined && sy !== undefined ? Math.sqrt(sx * sy) : (sx ?? sy)!;
    const count = shared[d] ?? 0;
    const need = REVEAL_THRESHOLD[d] ?? 1;
    dims[d] = { score: mutual, revealed: count >= need, sharedCount: count, toReveal: Math.max(0, need - count) };
  }

  // Derived dimensions are symmetric and always revealed.
  const derived: Array<[Dimension, number, string]> = [
    ['timeline', timelineScore(a.intention, b.intention), DERIVED_KEYS.timeline],
    ['language', languageScore(a, b), DERIVED_KEYS.language],
    ['location', locationScore(a, b), DERIVED_KEYS.location],
  ];
  const relocationAnswers = mutualOf(ab.location, ba.location);
  for (const [d, s, key] of derived) {
    // Blend the relocation question (if both answered) into the derived location fit.
    const score = d === 'location' && relocationAnswers !== undefined ? (s + relocationAnswers) / 2 : s;
    dims[d] = { score, revealed: true, sharedCount: 1, toReveal: 0 };
    directionalDims.ab[d] = score;
    directionalDims.ba[d] = score;
    if (score >= 0.9) reasons.push({ questionKey: key, value: null, dimension: d, weight: 4 });
  }

  const overallFor = (viewer: MatchProfile, scores: Partial<Record<Dimension, number>>) => {
    let sum = 0;
    let weight = 0;
    for (const [d, s] of Object.entries(scores) as Array<[Dimension, number]>) {
      const w = IMPORTANCE_WEIGHT[viewer.dimensionImportance[d] ?? 'important'];
      sum += s * w;
      weight += w;
    }
    return weight > 0 ? sum / weight : 0;
  };

  const overall = Math.sqrt(overallFor(a, directionalDims.ab) * overallFor(b, directionalDims.ba));
  reasons.sort((x, y) => y.weight - x.weight);

  return {
    overall,
    displayPct: Math.round(overall * 100),
    dims,
    reasons,
    discuss,
    algoVersion: ALGO_VERSION,
  };
}

function mutualOf(x: Directional | undefined, y: Directional | undefined): number | undefined {
  const sx = x && x.weight > 0 ? x.sum / x.weight : undefined;
  const sy = y && y.weight > 0 ? y.sum / y.weight : undefined;
  if (sx === undefined && sy === undefined) return undefined;
  return sx !== undefined && sy !== undefined ? Math.sqrt(sx * sy) : (sx ?? sy)!;
}

/** True when `candidate` violates none of `viewer`'s dealbreakers. Unanswered questions pass. */
export function passesDealbreakers(viewer: MatchProfile, candidate: MatchProfile): boolean {
  const cand = answerMap(candidate);
  for (const a of viewer.answers) {
    if (a.importance !== 'dealbreaker' || !a.accept || a.accept.length === 0) continue;
    if (!QUESTIONS_BY_KEY[a.questionKey]) continue;
    const values = asArray(cand.get(a.questionKey)?.self);
    if (values.length === 0) continue;
    if (!values.some((v) => a.accept!.includes(v))) return false;
  }
  return true;
}
