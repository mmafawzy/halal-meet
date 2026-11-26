import {
  GUARDIAN_PERMISSIONS,
  GUARDIAN_RELATIONSHIPS,
  type Gender,
  type GuardianOpinionValue,
  type GuardianPermission,
  type GuardianPermissions,
  type GuardianRelationship,
  type HalalMode,
} from '@halal-meet/core';
import type { Href } from 'expo-router';
import { Platform, Share } from 'react-native';

import { ApiError } from '@/api';
import { useMe } from '@/api/hooks';
import type { IconName } from '@/components/ui';
import { useSession } from '@/state/session';
import type { TFunction } from '@/i18n';

export const RELATIONSHIPS: GuardianRelationship[] = GUARDIAN_RELATIONSHIPS;

export const OPINIONS: GuardianOpinionValue[] = ['support', 'discuss', 'concern'];
export const OPINION_TONE = { support: 'primary', discuss: 'amber', concern: 'danger' } as const;

export const RELATIONSHIP_ICONS: Record<GuardianRelationship, IconName> = {
  father: 'man-outline',
  mother: 'woman-outline',
  brother: 'man-outline',
  sister: 'woman-outline',
  uncle: 'man-outline',
  aunt: 'woman-outline',
  other: 'person-outline',
};

export const PERMISSION_ICONS: Record<GuardianPermission, IconName> = {
  see_matches: 'people-outline',
  see_reports: 'analytics-outline',
  read_conversations: 'chatbubbles-outline',
  participate: 'create-outline',
  join_calls: 'videocam-outline',
  approve_stages: 'checkmark-done-outline',
  contact_family: 'home-outline',
  safety_alerts: 'shield-checkmark-outline',
};

/** Grammatical gender of a guardian (for `_he` / `_she` Arabic copy). "Someone else" reads as masculine. */
export function guardianGender(r: GuardianRelationship): Gender {
  return r === 'mother' || r === 'sister' || r === 'aunt' ? 'female' : 'male';
}

/**
 * The guardian area home (`src/app/guardian/index.tsx`). Typed routes currently generate it as
 * `/guardian/index` (it sits next to `[code]`), so the plain path is cast once here.
 */
export const GUARDIAN_HOME = '/guardian' as Href;

export { INVITE_LINK_BASE, cleanInviteCode, inviteLink } from '@/lib/inviteCode';

/** The `error` code of a failed API call (`cannot_guard_self`, `guardian_paused`…), with its HTTP status. */
export function apiError(e: unknown): { status: number; code: string } | null {
  return e instanceof ApiError ? { status: e.status, code: e.code } : null;
}

/** "introductions, compatibility reports, safety alerts" (or null when nothing is shared). */
export function permissionList(t: TFunction, perms: GuardianPermissions): string | null {
  const on = GUARDIAN_PERMISSIONS.filter((p) => perms[p]);
  if (on.length === 0) return null;
  return on.map((p) => t(`family.guardians.permissionShort.${p}`)).join(t('family.guardians.listSeparator'));
}

/** The user's own Halal Mode and first name: from GET /me, falling back to the onboarding draft. */
export function useMyFamilyContext(): { mode: HalalMode; firstName: string; gender: Gender } {
  const me = useMe();
  const draft = useSession((s) => s.draft);
  const sessionGender = useSession((s) => s.gender);
  const profile = me.data?.profile ?? null;
  return {
    mode: profile?.halalMode ?? draft.halalMode ?? 'guided',
    firstName: profile?.firstName || draft.firstName || '',
    gender: profile?.gender ?? sessionGender ?? draft.gender ?? 'male',
  };
}

/**
 * Copies text to the clipboard. The web uses the async Clipboard API; native has no clipboard module
 * installed (no expo-clipboard), so it returns false and the caller suggests Share instead.
 */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  try {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } }).navigator;
    if (!nav?.clipboard?.writeText) return false;
    await nav.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** Opens the system share sheet (WhatsApp, SMS…). Resolves false if sharing is unavailable or failed. */
export async function shareText(message: string): Promise<boolean> {
  try {
    // The message already contains the link, so `url` is not passed (iOS would append it twice).
    await Share.share({ message });
    return true;
  } catch {
    return false;
  }
}
