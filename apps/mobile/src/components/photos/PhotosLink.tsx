import { router, type Href } from 'expo-router';

import { ListRow, RowGroup } from '@/components/ui';
import { useT } from '@/i18n';

import { useIncomingPhotoRequests, useMyPhotos } from './usePhotos';

export const PHOTOS_SCREEN = '/settings/photos' as Href;

/** One-line entry point to settings/photos (mounted in settings/edit). */
export function PhotosLink() {
  const t = useT();
  const photos = useMyPhotos();
  const requests = useIncomingPhotoRequests();
  const pending = (requests.data ?? []).filter((r) => r.status === 'pending').length;
  const count = photos.data?.length ?? 0;
  return (
    <RowGroup>
      <ListRow
        icon="images-outline"
        label={t('photos.manage.link')}
        description={pending > 0 ? `${t('photos.requests.title')}: ${pending}` : t('photos.manage.linkBody')}
        value={String(count)}
        onPress={() => router.push(PHOTOS_SCREEN)}
      />
    </RowGroup>
  );
}
