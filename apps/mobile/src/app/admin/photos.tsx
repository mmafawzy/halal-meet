import type { AdminPhotoItem, AdminPhotoStatus } from '@halal-meet/core';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ActionSheet, AdminShell, PersonLine, useAgo } from '@/components/admin/parts';
import { adminErrorKey, useAdminPhotos, useDecidePhoto } from '@/components/admin/useAdmin';
import { Avatar, Button, EmptyState, ErrorState, LoadingState, Segmented, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

/** Photo review grid (pre-moderation, spec 05 §3.3): approve in one tap, reject with a reason. */
export default function AdminPhotosScreen() {
  const t = useT();
  const [status, setStatus] = useState<AdminPhotoStatus>('pending');
  const q = useAdminPhotos(status);
  const decide = useDecidePhoto();
  const [rejecting, setRejecting] = useState<AdminPhotoItem | null>(null);
  const [error, setError] = useState<string | null>(null);

  const done = () => useUi.getState().showToast({ message: t('admin.done.photo'), tone: 'success' });
  const fail = (e: unknown) => useUi.getState().showToast({ message: t(adminErrorKey(e)), tone: 'danger' });

  const body = () => {
    if (q.isLoading) return <LoadingState />;
    if (q.isError) return <ErrorState message={t(adminErrorKey(q.error))} onRetry={() => void q.refetch()} />;
    if (!q.data?.length) return <EmptyState icon="images-outline" title={t('admin.queue.emptyTitle')} body={t(status === 'pending' ? 'admin.photos.emptyPending' : 'admin.photos.empty')} />;
    return (
      <View style={styles.grid}>
        {q.data.map((p) => (
          <PhotoCard
            key={p.id}
            photo={p}
            busy={decide.isPending && decide.variables?.id === p.id}
            onApprove={() => decide.mutate({ id: p.id, body: { decision: 'approve' } }, { onSuccess: done, onError: fail })}
            onReject={() => {
              setError(null);
              setRejecting(p);
            }}
          />
        ))}
      </View>
    );
  };

  return (
    <AdminShell tab="photos">
      <Segmented
        value={status}
        onChange={setStatus}
        options={(['pending', 'approved', 'rejected'] as const).map((s) => ({ value: s, label: t(`admin.photos.${s}`) }))}
        style={{ maxWidth: 420 }}
      />
      {body()}
      <ActionSheet
        visible={!!rejecting}
        onClose={() => setRejecting(null)}
        title={t('admin.photos.rejectTitle')}
        body={t('admin.photos.rejectBody')}
        confirmLabel={t('admin.photos.reject')}
        danger
        showNeutralNote={false}
        presets={(['not_person', 'immodest', 'contact', 'stolen'] as const).map((k) => t(`admin.photos.presets.${k}`))}
        loading={decide.isPending}
        error={error}
        onConfirm={({ reason }) =>
          rejecting &&
          decide.mutate(
            { id: rejecting.id, body: { decision: 'reject', reason } },
            {
              onSuccess: () => {
                setRejecting(null);
                done();
              },
              onError: (e) => setError(t(adminErrorKey(e))),
            },
          )
        }
      />
    </AdminShell>
  );
}

function PhotoCard({ photo, busy, onApprove, onReject }: { photo: AdminPhotoItem; busy: boolean; onApprove: () => void; onReject: () => void }) {
  const t = useT();
  const ago = useAgo();
  return (
    <View style={styles.card} testID={`admin-photo-${photo.id}`}>
      <View style={styles.frame}>
        {photo.url ? (
          <Image source={{ uri: photo.url }} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityIgnoresInvertColors />
        ) : (
          <View style={styles.placeholder}>
            <Avatar id={photo.id} name={photo.owner.firstName ?? '?'} size={72} />
            <Text variant="caption" color={colors.textSubtle}>
              {t('admin.photos.noPreview')}
            </Text>
          </View>
        )}
        {photo.position === 0 ? (
          <View style={styles.mainTag}>
            <Text variant="caption" color={palette.ivory50}>
              {t('admin.photos.main')}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ padding: spacing.sm, gap: spacing.sm }}>
        <PersonLine person={photo.owner} compact />
        <Text variant="caption" color={colors.textSubtle}>
          {t('admin.photos.uploaded', { when: ago(photo.createdAt) })}
          {photo.width && photo.height ? ` · ${photo.width}×${photo.height}` : ''}
        </Text>
        {photo.status === 'pending' ? (
          <View style={styles.buttons}>
            <Button size="sm" label={t('admin.photos.approve')} icon="checkmark" onPress={onApprove} loading={busy} style={{ flex: 1 }} testID={`admin-photo-approve-${photo.id}`} />
            <Button size="sm" variant="danger" label={t('admin.photos.reject')} onPress={onReject} style={{ flex: 1 }} testID={`admin-photo-reject-${photo.id}`} />
          </View>
        ) : (
          <Button
            size="sm"
            variant="outline"
            label={photo.status === 'approved' ? t('admin.photos.reject') : t('admin.photos.approve')}
            onPress={photo.status === 'approved' ? onReject : onApprove}
            loading={busy}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  card: {
    width: 230,
    flexGrow: 1,
    maxWidth: 300,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  frame: { aspectRatio: 4 / 5, backgroundColor: palette.sand100 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
  mainTag: { position: 'absolute', top: spacing.sm, start: spacing.sm, backgroundColor: palette.navy900, borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
});
