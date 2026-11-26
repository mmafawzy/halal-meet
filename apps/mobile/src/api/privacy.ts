/**
 * Privacy centre client (`PRIVACY_ROUTES` in @halal-meet/core): pause, incognito, consents, data export,
 * account deletion, plus the loose-end reads (saved preferences, blocked list, profiles shared with guardians).
 * Exposed as `api.privacy`; `live.ts` builds it over HTTP and `mock/privacy.ts` in memory.
 */
import type {
  BlockedMember,
  Consent,
  ConsentKind,
  DataExport,
  GuardianShareSummary,
  MyPreferencesResponse,
  PRIVACY_ROUTES,
  PrivacyStatus,
} from '@halal-meet/core';

export interface PrivacyApi {
  status(): Promise<PrivacyStatus>; // GET /me/privacy (allowed while suspended / deletion pending)
  pause(until: string | null): Promise<PrivacyStatus>; // PUT /me/pause (null = until I resume)
  resume(): Promise<PrivacyStatus>; // DELETE /me/pause
  setIncognito(on: boolean): Promise<PrivacyStatus>; // PUT /me/incognito (403 plan_required)
  exportData(): Promise<DataExport>; // GET /me/export (attachment)
  requestDeletion(): Promise<PrivacyStatus>; // POST /me/deletion
  cancelDeletion(): Promise<PrivacyStatus>; // DELETE /me/deletion (409 grace_period_over)
  consents(): Promise<Consent[]>; // GET /me/consents
  putConsent(kind: ConsentKind, granted: boolean): Promise<Consent[]>; // PUT /me/consents/:kind
  preferences(): Promise<MyPreferencesResponse>; // GET /me/preferences
  blocks(): Promise<BlockedMember[]>; // GET /blocks
  unblock(subjectId: string): Promise<void>; // DELETE /blocks/:subjectId
  guardianShares(): Promise<GuardianShareSummary[]>; // GET /guardians/shares
}

export type PrivacyRouteKey = keyof typeof PRIVACY_ROUTES;

/** The live client's request helper, narrowed to privacy routes. */
export type PrivacyCall = <T>(route: PrivacyRouteKey, opts?: { params?: Record<string, string>; body?: unknown }) => Promise<T>;

function list<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

export function createLivePrivacyApi(call: PrivacyCall): PrivacyApi {
  return {
    status: () => call('privacyStatus'),
    pause: (until) => call('privacyPause', { body: { until } }),
    resume: () => call('privacyResume'),
    setIncognito: (on) => call('privacyIncognito', { body: { on } }),
    exportData: () => call('privacyExport'),
    requestDeletion: () => call('privacyRequestDeletion'),
    cancelDeletion: () => call('privacyCancelDeletion'),
    consents: async () => list(await call('privacyConsents')),
    putConsent: async (kind, granted) => list(await call('privacyPutConsent', { params: { kind }, body: { granted } })),
    preferences: () => call('privacyPreferences'),
    blocks: async () => list(await call('privacyBlocks')),
    unblock: async (subjectId) => {
      await call('privacyUnblock', { params: { subjectId } });
    },
    guardianShares: async () => list(await call('privacyGuardianShares')),
  };
}
