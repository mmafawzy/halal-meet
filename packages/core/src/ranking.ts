/** Ranking signals for one candidate in a viewer's feed (spec 04 §3). All inputs are 0..1. */
export interface RankSignals {
  overall: number;
  pMutual: number;
  responsiveness: number;
  freshness: number;
  verification: number;
  completeness: number;
  /** Subtracted: recent risk signals, chronic ghosting. */
  penalty: number;
}

export const RANK_WEIGHTS = {
  overall: 0.55,
  pMutual: 0.15,
  responsiveness: 0.1,
  freshness: 0.08,
  verification: 0.07,
  completeness: 0.05,
};

export function rankScore(s: RankSignals): number {
  return (
    RANK_WEIGHTS.overall * s.overall +
    RANK_WEIGHTS.pMutual * s.pMutual +
    RANK_WEIGHTS.responsiveness * s.responsiveness +
    RANK_WEIGHTS.freshness * s.freshness +
    RANK_WEIGHTS.verification * s.verification +
    RANK_WEIGHTS.completeness * s.completeness -
    s.penalty
  );
}

export interface ExposureState {
  impressionsToday: number;
  pendingInbound: number;
}

export const EXPOSURE = {
  /** Soft daily impression cap before progressive demotion. */
  softCap: 150,
  /** Guaranteed minimum impressions per day; profiles below get a boost. */
  floor: 25,
  /** Pending unanswered interests before inbound demotion. */
  inboundCap: 30,
};

/**
 * Multiplier applied to a candidate's rank to pace attention (spec 04 §4.5).
 * Over-exposed or overloaded profiles are demoted, never removed; under-exposed profiles get a boost.
 */
export function exposureMultiplier(s: ExposureState): number {
  let m = 1;
  if (s.impressionsToday < EXPOSURE.floor) m *= 1.15;
  if (s.impressionsToday > EXPOSURE.softCap) {
    const over = (s.impressionsToday - EXPOSURE.softCap) / EXPOSURE.softCap;
    m *= Math.max(0.3, 1 - over);
  }
  if (s.pendingInbound > EXPOSURE.inboundCap) {
    const over = (s.pendingInbound - EXPOSURE.inboundCap) / EXPOSURE.inboundCap;
    m *= Math.max(0.3, 1 - 0.5 * over);
  }
  return m;
}

/** Market quality floor (display %). Cards below are shown only after a "Broader matches" divider. */
export const DEFAULT_QUALITY_FLOOR = 65;
