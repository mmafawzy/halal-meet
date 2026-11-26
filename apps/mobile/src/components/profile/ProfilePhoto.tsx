import type { ProfileCard } from '@halal-meet/core';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { qk } from '@/api/hooks';
import { usePhotoAccess, useRequestPhotoAccess } from '@/components/photos/usePhotos';
import { Avatar, Button, Icon, Text } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * Photo hero with the three privacy states from the server: visible, blurred ("Request to view", or
 * "after you match" when a request cannot unlock it) and family-only lock. Requests go through
 * POST /photos/requests; a declined request keeps showing "Request sent" (declining is silent).
 */
export function ProfilePhoto({ card }: { card: ProfileCard }) {
  const t = useT();
  const ts = useTs();
  const qc = useQueryClient();
  const state = card.photoState;
  const access = usePhotoAccess(card.id, state === 'blurred');
  const request = useRequestPhotoAccess(card.id);
  const view = access.data;

  // Once they approve, reload the card so the photo itself appears.
  const approvedNow = state === 'blurred' && !!view?.hasAccess;
  useEffect(() => {
    if (approvedNow) void qc.invalidateQueries({ queryKey: qk.profile(card.id) });
  }, [approvedNow, card.id, qc]);

  const requested = view?.status === 'pending' || view?.status === 'approved';
  const matchesOnly = !!view && !view.canRequest && view.status === 'none' && !view.hasAccess;

  return (
    <View style={styles.wrap}>
      <Avatar id={card.id} name={card.firstName} photoUrl={card.photoUrl} photoState={state} size={168} shape="rounded" />
      {state === 'visible' && view?.status === 'approved' ? (
        <Text variant="caption" color={colors.primary} testID="photo-approved">
          {ts('photos.access.approvedBody', card.gender, { name: card.firstName })}
        </Text>
      ) : null}
      {state === 'blurred' ? (
        <View style={styles.note} testID="photo-blurred">
          <View style={styles.row}>
            <Icon name={matchesOnly ? 'hand-left-outline' : 'eye-off-outline'} size={16} color={palette.navy500} />
            <Text variant="small" weight="semibold">
              {matchesOnly ? t('photos.access.matchesOnly') : t('profile.photo.blurred')}
            </Text>
          </View>
          <Text variant="caption" color={colors.textMuted} center>
            {matchesOnly
              ? ts('photos.access.matchesOnlyBody', card.gender)
              : requested
                ? ts('photos.access.pendingBody', card.gender)
                : ts('photos.access.requestBody', card.gender, { name: card.firstName })}
          </Text>
          {matchesOnly ? null : (
            <Button
              label={requested ? t('photos.access.requested') : t('photos.access.request')}
              icon={requested ? 'checkmark' : 'lock-open-outline'}
              variant={requested ? 'ghost' : 'secondary'}
              size="sm"
              disabled={requested || access.isLoading}
              loading={request.isPending}
              onPress={() => request.mutate()}
              testID="photo-request"
            />
          )}
        </View>
      ) : state === 'locked' ? (
        <View style={styles.note} testID="photo-locked">
          <View style={styles.row}>
            <Icon name="people-outline" size={16} color={palette.navy500} />
            <Text variant="small" weight="semibold">
              {ts('profile.photo.locked', card.gender)}
            </Text>
          </View>
          <Text variant="caption" color={colors.textMuted} center>
            {ts('profile.photo.lockedBody', card.gender)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', gap: spacing.md },
  note: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.bgMuted,
    alignSelf: 'stretch',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
