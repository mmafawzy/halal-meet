import type { ConsentKind } from '@halal-meet/core';

import { api } from '@/api';

/** Records one consent decision (PUT /me/consents/:kind). Never throws: consent sync must not block onboarding. */
export async function recordConsent(kind: ConsentKind, granted: boolean): Promise<void> {
  try {
    await api.privacy.putConsent(kind, granted);
  } catch {
    // Retried implicitly the next time the member changes it in the Privacy centre.
  }
}

/**
 * Right after sign-in from the phone step: terms + privacy (ticked, required) and the religious-data choice.
 * `religious` is null when the phone step was not shown in this session (nothing to record then).
 */
export async function recordSignupConsents(religious: boolean | null): Promise<void> {
  if (religious === null) return;
  await Promise.all([recordConsent('terms', true), recordConsent('privacy', true), recordConsent('religious_data', religious)]);
}
