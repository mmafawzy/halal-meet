import type { PrivacyStatus } from '@halal-meet/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { isApiError } from './errors';
import { useAccountActions } from '@/components/me/accountActions';
import { Button, Card, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

import { useCancelDeletion } from './usePrivacy';

/**
 * Shown at the top of the Privacy centre when the account is not in its normal state: a deletion request
 * (with cancellation inside the grace period), a suspension or a closed account. Calm, factual wording.
 */
export function AccountStateCard({ status }: { status: PrivacyStatus }) {
  const t = useT();
  const locale = useLocale();
  const cancel = useCancelDeletion();
  const { signOut } = useAccountActions();
  const dateOpts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };

  if (status.state === 'deletion_pending') {
    const onCancel = () =>
      cancel.mutate(undefined, {
        onSuccess: () => {
          useUi.getState().showToast({ message: t('me.privacy.pending.cancelledToast'), tone: 'success' });
          router.replace('/');
        },
        onError: (e) =>
          useUi.getState().showToast({
            message: isApiError(e, 'grace_period_over') ? t('me.privacy.pending.expired') : t('common.states.error'),
            tone: 'danger',
          }),
      });
    return (
      <Card tone="danger">
        <View style={{ gap: spacing.md }} testID="privacy-deletion-pending">
          <Text variant="subheading">{t('me.privacy.pending.title')}</Text>
          <Text variant="small">{t('me.privacy.pending.body', { date: formatDate(status.deletionScheduledFor, locale, dateOpts) })}</Text>
          <Button label={t('me.privacy.pending.cancel')} fullWidth loading={cancel.isPending} onPress={onCancel} testID="privacy-cancel-deletion" />
          <Button label={t('me.privacy.pending.signOut')} variant="ghost" fullWidth onPress={() => void signOut()} />
        </View>
      </Card>
    );
  }

  if (status.state === 'suspended' || status.state === 'banned') {
    const banned = status.state === 'banned';
    const body = banned
      ? t('me.privacy.restricted.bannedBody')
      : status.suspendedUntil
        ? t('me.privacy.restricted.suspendedBody', { date: formatDate(status.suspendedUntil, locale, dateOpts) })
        : t('me.privacy.restricted.suspendedNoDate');
    return (
      <Card tone="muted">
        <View style={{ gap: spacing.sm }} testID="privacy-restricted">
          <Text variant="subheading">{banned ? t('me.privacy.restricted.bannedTitle') : t('me.privacy.restricted.suspendedTitle')}</Text>
          <Text variant="small" color={colors.textMuted}>
            {body}
          </Text>
        </View>
      </Card>
    );
  }

  return null;
}
