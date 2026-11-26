import { PHOTO_LIMITS, type Photo } from '@halal-meet/core';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineNote } from '@/components/onboarding/OnboardingFrame';
import { Button, Card, EmptyState, ErrorState, LoadingState, Sheet, Tag, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

import { pickPhoto } from './pickPhoto';
import { photoErrorMessage, useDeletePhoto, useMyPhotos, useReorderPhotos, useUploadPhoto } from './usePhotos';

const STATUS_TONE = { pending: 'amber', approved: 'primary', rejected: 'danger' } as const;

/** Add / remove / reorder your photos; position 0 is the main photo (spec 01 §10). */
export function PhotoManager() {
  const t = useT();
  const photos = useMyPhotos();
  const upload = useUploadPhoto();
  const remove = useDeletePhoto();
  const reorder = useReorderPhotos();
  const [denied, setDenied] = useState(false);
  const [confirm, setConfirm] = useState<Photo | null>(null);

  if (photos.isLoading) return <LoadingState />;
  if (photos.isError) return <ErrorState onRetry={() => void photos.refetch()} />;
  const list = photos.data ?? [];
  const full = list.filter((p) => p.status !== 'rejected').length >= PHOTO_LIMITS.maxPhotos;

  const add = async () => {
    setDenied(false);
    const picked = await pickPhoto();
    if (picked === 'denied') return setDenied(true);
    if (!picked) return;
    try {
      await upload.mutateAsync(picked);
      useUi.getState().showToast({ message: t('photos.manage.uploaded'), tone: 'success' });
    } catch (e) {
      useUi.getState().showToast({ message: photoErrorMessage(e), tone: 'danger' });
    }
  };

  const move = (index: number, to: number) => {
    const ids = list.map((p) => p.id);
    const [id] = ids.splice(index, 1);
    ids.splice(to, 0, id!);
    reorder.mutate(ids);
  };

  return (
    <View style={{ gap: spacing.md }} testID="photo-manager">
      <View style={styles.headRow}>
        <Text variant="small" color={colors.textMuted}>
          {t('photos.manage.count', { n: list.length, max: PHOTO_LIMITS.maxPhotos })}
        </Text>
      </View>

      {list.length === 0 ? <EmptyState icon="image-outline" title={t('photos.manage.emptyTitle')} body={t('photos.manage.emptyBody')} /> : null}

      {list.map((p, i) => (
        <Card key={p.id} padded={false} style={styles.item}>
          <View style={styles.row} testID={`photo-item-${i}`}>
            <Image source={{ uri: p.url }} style={styles.thumb} contentFit="cover" accessibilityIgnoresInvertColors />
            <View style={{ flex: 1, gap: spacing.xs }}>
              <View style={styles.tags}>
                {p.isMain ? <Tag label={t('photos.manage.main')} icon="star" tone="gold" /> : null}
                <Tag label={t(`photos.manage.status.${p.status}`)} tone={STATUS_TONE[p.status]} />
              </View>
              {p.status !== 'approved' ? (
                <Text variant="caption" color={colors.textMuted}>
                  {t(`photos.manage.statusBody.${p.status}`)}
                </Text>
              ) : null}
              <View style={styles.actions}>
                {i > 0 ? (
                  <>
                    <Button label={t('photos.manage.makeMain')} size="sm" variant="secondary" onPress={() => move(i, 0)} disabled={reorder.isPending} testID={`photo-main-${i}`} />
                    <Button label={t('photos.manage.earlier')} size="sm" variant="ghost" icon="arrow-up" onPress={() => move(i, i - 1)} disabled={reorder.isPending} />
                  </>
                ) : null}
                {i < list.length - 1 ? (
                  <Button label={t('photos.manage.later')} size="sm" variant="ghost" icon="arrow-down" onPress={() => move(i, i + 1)} disabled={reorder.isPending} />
                ) : null}
                <Button label={t('photos.manage.remove')} size="sm" variant="ghost" icon="trash-outline" onPress={() => setConfirm(p)} testID={`photo-remove-${i}`} />
              </View>
            </View>
          </View>
        </Card>
      ))}

      {!full ? (
        <Button
          label={upload.isPending ? t('photos.manage.adding') : t('photos.manage.add')}
          icon="camera-outline"
          variant="secondary"
          fullWidth
          loading={upload.isPending}
          onPress={() => void add()}
          testID="photo-add"
        />
      ) : (
        <InlineNote tone="muted" text={t('photos.manage.errors.photo_limit', { max: PHOTO_LIMITS.maxPhotos })} />
      )}
      {denied ? <InlineNote tone="danger" text={t('photos.manage.permissionDenied')} /> : null}

      <Sheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('photos.manage.removeTitle')}
        subtitle={t('photos.manage.removeBody')}
        testID="photo-remove-sheet"
        footer={
          <Button
            label={t('photos.manage.remove')}
            variant="danger"
            fullWidth
            loading={remove.isPending}
            onPress={() => {
              if (!confirm) return;
              remove.mutate(confirm.id, { onSettled: () => setConfirm(null) });
            }}
            testID="photo-remove-confirm"
          />
        }
      >
        {confirm ? (
          <View style={{ alignItems: 'center' }}>
            <Image source={{ uri: confirm.url }} style={styles.preview} contentFit="cover" />
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  item: { overflow: 'hidden' },
  row: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, alignItems: 'flex-start' },
  thumb: { width: 84, height: 112, borderRadius: radii.md, backgroundColor: palette.sand100 },
  preview: { width: 150, height: 200, borderRadius: radii.lg, backgroundColor: palette.sand100 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
});

