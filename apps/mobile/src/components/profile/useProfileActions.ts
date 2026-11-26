import { PLAN_LIMITS, type ProfileCard } from '@halal-meet/core';
import { router } from 'expo-router';

import { useGuardians, useMe, useShareWithGuardians } from '@/api/hooks';
import { useGuardianShares } from '@/components/privacy/usePrivacy';
import { useT } from '@/i18n';
import { useLocal } from '@/state/local';
import { useUi } from '@/state/ui';

/**
 * Profile actions: "Save for later" (device-only, no API route yet) and "Share with my guardian"
 * (POST /guardians/shares → the profile appears on every guardian's dashboard for an opinion;
 * DELETE /guardians/shares/:subjectId to stop). "Stop sharing" is offered for every id in GET /guardians/shares. Without a guardian, the user is pointed to
 * the Family tab instead.
 */
export function useProfileActions() {
  const t = useT();
  const me = useMe();
  const saved = useLocal((s) => s.saved);
  const save = useLocal((s) => s.save);
  const unsave = useLocal((s) => s.unsave);
  const localSharedIds = useLocal((s) => s.sharedWithGuardians);
  // GET /guardians/shares works across devices; the device list is only a fallback while it loads or fails.
  const remoteShares = useGuardianShares().data;
  const sharedIds = remoteShares ? remoteShares.map((x) => x.subjectId) : localSharedIds;
  const guardians = useGuardians().data ?? [];
  const share = useShareWithGuardians();
  const showToast = useUi((s) => s.showToast);
  const tier = me.data?.entitlements.tier ?? 'free';

  const isSaved = (id: string) => saved.some((c) => c.id === id);
  const isShared = (id: string) => sharedIds.includes(id);

  const toggleSave = (card: ProfileCard) => {
    if (isSaved(card.id)) {
      unsave(card.id);
      showToast({ message: t('profile.menu.unsaved'), durationMs: 1800 });
      return;
    }
    const cap = PLAN_LIMITS[tier].savedProfiles;
    if (cap !== null && saved.length >= cap) {
      showToast({ message: t('profile.menu.saveFull'), tone: 'danger' });
      return;
    }
    save(card);
    showToast({ message: t('common.limitSheet.savedToast'), tone: 'success', durationMs: 1800 });
  };

  /** Shares a profile with the member's guardians (active or still invited). Re-sharing is idempotent. */
  const shareWithGuardian = (subjectId: string) => {
    const reachable = guardians.filter((g) => g.status !== 'paused');
    if (guardians.length === 0) {
      showToast({
        message: t('profile.menu.shareNone'),
        actionLabel: t('profile.menu.openFamily'),
        onAction: () => router.push('/(tabs)/family'),
        durationMs: 4000,
      });
      return;
    }
    if (reachable.length === 0) {
      showToast({
        message: t('profile.menu.shareWaiting'),
        actionLabel: t('profile.menu.openFamily'),
        onAction: () => router.push('/(tabs)/family'),
        durationMs: 4000,
      });
      return;
    }
    const anyActive = reachable.some((g) => g.status === 'active');
    share.mutate(
      { subjectId, share: true },
      {
        onSuccess: () =>
          showToast({ message: anyActive ? t('profile.menu.shareSent') : t('profile.menu.shareSentInvited'), tone: 'success', durationMs: 3500 }),
        onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
      },
    );
  };

  const unshareWithGuardian = (subjectId: string) => {
    share.mutate(
      { subjectId, share: false },
      {
        onSuccess: () => showToast({ message: t('profile.menu.unshared'), durationMs: 2500 }),
        onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
      },
    );
  };

  return { isSaved, toggleSave, isShared, shareWithGuardian, unshareWithGuardian, sharing: share.isPending };
}
