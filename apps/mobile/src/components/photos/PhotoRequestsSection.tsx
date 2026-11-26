import type { IncomingPhotoRequest } from '@halal-meet/core';
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { Avatar, Button, Card, SectionTitle, Text } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

import { useDecidePhotoRequest, useIncomingPhotoRequests } from './usePhotos';

/**
 * Owner side of "Request to view" (spec 01 §41): approve, decline (silent) or stop sharing later.
 * Self-contained so it can be mounted anywhere with one line (settings/photos and the privacy centre).
 */
export function PhotoRequestsSection({ hideWhenEmpty = false }: { hideWhenEmpty?: boolean }) {
  const t = useT();
  const requests = useIncomingPhotoRequests();
  const list = requests.data ?? [];
  if (hideWhenEmpty && list.length === 0) return null;

  return (
    <View style={{ gap: spacing.sm }} testID="photo-requests">
      <SectionTitle title={t('photos.requests.title')} style={{ marginBottom: 0 }} />
      <Text variant="small" color={colors.textMuted}>
        {t('photos.requests.subtitle')}
      </Text>
      {requests.isLoading ? null : list.length === 0 ? (
        <Text variant="small" color={colors.textMuted} testID="photo-requests-empty">
          {t('photos.requests.empty')}
        </Text>
      ) : (
        list.map((r, i) => <RequestRow key={r.id} request={r} index={i} />)
      )}
    </View>
  );
}

function RequestRow({ request: r, index }: { request: IncomingPhotoRequest; index: number }) {
  const t = useT();
  const ts = useTs();
  const decide = useDecidePhotoRequest();
  const name = r.requester.firstName;

  const act = (decision: 'approve' | 'decline') =>
    decide.mutate(
      { id: r.id, decision },
      {
        onSuccess: () => {
          const key = decision === 'approve' ? 'approved' : r.status === 'approved' ? 'revoked' : 'declined';
          useUi.getState().showToast({
            message: t(`photos.requests.${key}`, { name }),
            tone: 'success',
          });
        },
      },
    );

  return (
    <Card>
      <View testID={`photo-request-${index}`} style={{ gap: spacing.md }}>
        <View style={styles.row}>
          <Avatar id={r.requester.id} name={name} photoUrl={r.requester.photoUrl} photoState={r.requester.photoState} size={52} />
          <View style={{ flex: 1, gap: 2 }}>
            <Text
              variant="bodyStrong"
              onPress={() =>
                router.push({
                  pathname: '/profile/[id]',
                  params: { id: r.requester.id },
                })
              }
            >
              {name}
            </Text>
            <Text variant="caption" color={colors.textMuted}>
              {t('photos.requests.meta', {
                age: r.requester.age,
                city: r.requester.city,
              })}
            </Text>
            {r.status === 'approved' ? (
              <Text variant="caption" color={colors.primary}>
                {ts('photos.requests.approvedLabel', r.requester.gender)}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={styles.actions}>
          {r.status === 'pending' ? (
            <>
              <Button
                label={t('photos.requests.approve')}
                size="sm"
                icon="checkmark"
                onPress={() => act('approve')}
                disabled={decide.isPending}
                testID={`photo-request-approve-${index}`}
              />
              <Button
                label={t('photos.requests.decline')}
                size="sm"
                variant="ghost"
                onPress={() => act('decline')}
                disabled={decide.isPending}
                testID={`photo-request-decline-${index}`}
              />
            </>
          ) : (
            <Button
              label={t('photos.requests.revoke')}
              size="sm"
              variant="ghost"
              icon="eye-off-outline"
              onPress={() => act('decline')}
              disabled={decide.isPending}
              testID={`photo-request-revoke-${index}`}
            />
          )}
        </View>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
});
