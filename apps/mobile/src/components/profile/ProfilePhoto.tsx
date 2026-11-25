import type { ProfileCard } from '@halal-meet/core';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { Avatar, Button, Icon, Text } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * Photo hero with the three privacy states: visible, blurred ("Request to view") and family-only lock.
 * Photo requests have no API route yet, so the request state is kept on this screen only.
 */
export function ProfilePhoto({ card }: { card: ProfileCard }) {
  const t = useT();
  const ts = useTs();
  const [requested, setRequested] = useState(false);
  const state = card.photoState;

  return (
    <View style={styles.wrap}>
      <Avatar id={card.id} name={card.firstName} photoUrl={card.photoUrl} photoState={state} size={168} shape="rounded" />
      {state === 'blurred' ? (
        <View style={styles.note} testID="photo-blurred">
          <View style={styles.row}>
            <Icon name="eye-off-outline" size={16} color={palette.navy500} />
            <Text variant="small" weight="semibold">
              {t('profile.photo.blurred')}
            </Text>
          </View>
          <Text variant="caption" color={colors.textMuted} center>
            {requested ? ts('profile.photo.pending', card.gender) : ts('profile.photo.requestBody', card.gender, { name: card.firstName })}
          </Text>
          <Button
            label={requested ? t('profile.photo.requested') : t('profile.photo.request')}
            icon={requested ? 'checkmark' : 'lock-open-outline'}
            variant={requested ? 'ghost' : 'secondary'}
            size="sm"
            disabled={requested}
            onPress={() => setRequested(true)}
            testID="photo-request"
          />
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
