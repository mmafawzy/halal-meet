import { passesDealbreakers } from './compatibility';
import { regionOf, type CountryStatus } from './regions';
import type { EligibilityResult, Intention, MatchProfile, PassportDestination } from './types';

const INTENTION_ORDER: Intention[] = ['within_6m', 'within_1y', 'within_2y', 'serious_getting_to_know', 'unsure'];

export interface EligibilityContext {
  now: Date;
  countryStatus: (country: string) => CountryStatus;
}

function isLive(d: PassportDestination, now: Date, forLocals: boolean): boolean {
  if (d.status === 'cancelled' || d.status === 'expired') return false;
  if (d.activeUntil && new Date(d.activeUntil) < now) return false;
  // The traveller can browse immediately; locals only see them from visibleFrom (Travel mode starts 14 days early).
  return forLocals ? new Date(d.visibleFrom) <= now : true;
}

function passportCovers(d: PassportDestination, country: string): boolean {
  return d.isWorldwide || d.country === country;
}

/** Whether a Passport user may be shown to `local`, given the local's international visibility setting. */
function localAllows(local: MatchProfile, d: PassportDestination): boolean {
  if (local.intlVisibility === 'off') return false;
  if (local.intlVisibility === 'relocating_only') return ['relocate', 'moving', 'either'].includes(d.purpose);
  return true;
}

/**
 * Location rule (spec 04 §1, §1.1): may `viewer` see `candidate` in their feed?
 * - same country: yes
 * - same region while the viewer's country is Growing: yes
 * - viewer has Passport covering the candidate's country and the candidate allows international visibility: yes
 * - candidate has a Passport covering the viewer's country that is visible to locals: yes
 */
export function locationVisible(viewer: MatchProfile, candidate: MatchProfile, ctx: EligibilityContext): 'ok' | 'location' | 'passport_visibility' {
  if (viewer.country === candidate.country) return 'ok';
  if (ctx.countryStatus(viewer.country) === 'growing' && regionOf(viewer.country) === regionOf(candidate.country)) {
    return 'ok';
  }
  const viewerPassports = viewer.passport.filter((d) => isLive(d, ctx.now, false) && passportCovers(d, candidate.country));
  if (viewerPassports.length > 0) {
    return viewerPassports.some((d) => localAllows(candidate, d)) ? 'ok' : 'passport_visibility';
  }
  if (candidate.passport.some((d) => isLive(d, ctx.now, true) && passportCovers(d, viewer.country))) return 'ok';
  return 'location';
}

function oneWay(a: MatchProfile, b: MatchProfile): EligibilityResult {
  if (b.age < a.preferences.ageMin || b.age > a.preferences.ageMax) return { ok: false, failed: 'age' };
  if (!b.acceptedModes.includes(a.halalMode) || !a.acceptedModes.includes(b.halalMode)) {
    return { ok: false, failed: 'halal_mode' };
  }
  if (a.preferences.maritalStatuses && !a.preferences.maritalStatuses.includes(b.maritalStatus)) {
    return { ok: false, failed: 'marital' };
  }
  if (!a.preferences.acceptChildren && b.hasChildren) return { ok: false, failed: 'children' };
  if (a.preferences.verifiedOnly && !b.identityVerified) return { ok: false, failed: 'verification' };
  if (a.preferences.languages && !a.preferences.languages.some((l) => b.languages.includes(l))) {
    return { ok: false, failed: 'language' };
  }
  if (!passesDealbreakers(a, b)) return { ok: false, failed: 'dealbreaker' };
  return { ok: true };
}

/** Hard filters, checked in both directions. `viewer` is the person whose feed is being built. */
export function checkEligibility(viewer: MatchProfile, candidate: MatchProfile, ctx: EligibilityContext): EligibilityResult {
  if (viewer.id === candidate.id || viewer.gender === candidate.gender) return { ok: false, failed: 'gender' };

  const loc = locationVisible(viewer, candidate, ctx);
  if (loc !== 'ok') return { ok: false, failed: loc };

  const d = Math.abs(INTENTION_ORDER.indexOf(viewer.intention) - INTENTION_ORDER.indexOf(candidate.intention));
  if (d > 1) return { ok: false, failed: 'intention' };

  const forward = oneWay(viewer, candidate);
  if (!forward.ok) return forward;
  return oneWay(candidate, viewer);
}
