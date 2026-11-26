import { router } from 'expo-router';
import { View } from 'react-native';

import { useMe } from '@/api/hooks';
import { PhotoManager } from '@/components/photos/PhotoManager';
import { PhotoRequestsSection } from '@/components/photos/PhotoRequestsSection';
import { Header, ListRow, RowGroup, Screen, SectionTitle, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

/** Photos management: add / remove / reorder (main first), privacy level, and requests to see them. */
export default function PhotosScreen() {
  const t = useT();
  const me = useMe();
  const visibility = me.data?.profile?.photoVisibility;

  return (
    <Screen header={<Header title={t('photos.manage.title')} />} testID="photos-screen">
      <View style={{ gap: spacing.xl }}>
        <Text variant="small" color={colors.textMuted}>
          {t('photos.manage.subtitle')}
        </Text>

        <PhotoManager />

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('photos.manage.privacy')} style={{ marginBottom: 0 }} />
          <RowGroup>
            <ListRow
              icon="lock-closed-outline"
              label={visibility ? t(`common.photoVisibility.${visibility}`) : t('photos.manage.privacy')}
              description={visibility ? t(`common.photoVisibilityDesc.${visibility}`) : undefined}
              onPress={() => router.push('/settings/privacy')}
            />
          </RowGroup>
        </View>

        <PhotoRequestsSection />
      </View>
    </Screen>
  );
}
