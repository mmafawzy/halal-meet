import type { NotificationItem } from '@halal-meet/core';

import type { IconName } from '@/components/ui';
import { useT } from '@/i18n';

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Localised one-line text + icon for an inbox item (payload holds ids and template params only). */
export function useNotificationCopy(): (item: NotificationItem) => { text: string; icon: IconName } {
  const t = useT();
  return (item) => {
    const p = item.payload;
    const name = str(p.firstName);
    const guardian = str(p.guardianName) || t('notifications.items.someone');
    switch (item.kind) {
      case 'match':
        return { icon: 'heart-outline', text: name ? t('notifications.items.match', { name }) : t('notifications.items.matchNoName') };
      case 'message': {
        const n = typeof p.count === 'number' ? p.count : 1;
        if (!name) return { icon: 'chatbubble-outline', text: t('notifications.items.messageNoName') };
        return { icon: 'chatbubble-outline', text: n > 1 ? t('notifications.items.messageMany', { name, n }) : t('notifications.items.message', { name }) };
      }
      case 'interest':
        if (p.countOnly || !name) return { icon: 'sparkles-outline', text: t('notifications.items.interestCount') };
        return { icon: 'sparkles-outline', text: t('notifications.items.interest', { name }) };
      case 'serious_interest':
        return { icon: 'star-outline', text: name ? t('notifications.items.serious', { name }) : t('notifications.items.seriousNoName') };
      case 'guardian_accepted':
        return { icon: 'people-outline', text: t('notifications.items.guardianAccepted', { guardian }) };
      case 'guardian_opinion':
        return {
          icon: 'chatbox-ellipses-outline',
          text: name ? t('notifications.items.guardianOpinion', { guardian, name }) : t('notifications.items.guardianOpinionNoName', { guardian }),
        };
      case 'guardian_stage_decision':
        return {
          icon: p.decision === 'approve' ? 'checkmark-circle-outline' : 'chatbubbles-outline',
          text: t(p.decision === 'approve' ? 'notifications.items.guardianApproved' : 'notifications.items.guardianDiscuss', { guardian, stage: String(p.stage ?? '') }),
        };
      case 'guardian_removed':
        return { icon: 'people-outline', text: t('notifications.items.guardianRemoved') };
      case 'top_picks':
        return { icon: 'diamond-outline', text: t('notifications.items.topPicks') };
      case 'photo_request':
        return { icon: 'image-outline', text: name ? t('notifications.items.photoRequest', { name }) : t('notifications.items.photoRequestNoName') };
      case 'photo_approved':
        return { icon: 'image-outline', text: name ? t('notifications.items.photoApproved', { name }) : t('notifications.items.photoApprovedNoName') };
      case 'moderation': {
        const type = str(p.type);
        const known = ['warning', 'message_removed', 'suspended', 'banned', 'reinstated', 'photo_not_approved', 'report_reviewed'];
        return { icon: 'shield-checkmark-outline', text: t(`notifications.items.moderation.${known.includes(type) ? type : 'other'}`) };
      }
      case 'billing': {
        const event = str(p.event);
        const known = ['purchased', 'renewed', 'renewal_off', 'expired', 'billing_issue', 'refunded', 'paused'];
        return { icon: 'card-outline', text: t(`notifications.items.billing.${known.includes(event) ? event : 'other'}`) };
      }
      case 'account_deletion_scheduled':
        return { icon: 'trash-outline', text: t('notifications.items.deletionScheduled') };
      case 'account_deletion_cancelled':
        return { icon: 'refresh-outline', text: t('notifications.items.deletionCancelled') };
      default:
        return { icon: 'notifications-outline', text: t('notifications.items.fallback') };
    }
  };
}
