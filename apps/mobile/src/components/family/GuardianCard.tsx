import type { Guardian } from '@halal-meet/core';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { useSimulateGuardianAccept, useUpdateGuardian } from '@/api/hooks';
import { Avatar, Button, Card, Icon, Tag, Text } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

import { guardianGender, permissionList } from './shared';

const STATUS_TONE = { invited: 'amber', active: 'primary', paused: 'neutral' } as const;
const STATUS_ICON = { invited: 'mail-outline', active: 'checkmark-circle-outline', paused: 'pause-circle-outline' } as const;

/** One guardian: status, permission summary and the controls the user always keeps (spec 01 §44). */
export function GuardianCard({
  guardian: g,
  onEdit,
  onRemove,
  onShareAgain,
  sharing,
}: {
  guardian: Guardian;
  onEdit: () => void;
  onRemove: () => void;
  /** "Send the invitation again" — re-issues the code (only while not yet accepted). */
  onShareAgain: () => void;
  sharing?: boolean;
}) {
  const t = useT();
  const ts = useTs();
  const update = useUpdateGuardian();
  const simulate = useSimulateGuardianAccept();
  const showToast = useUi((s) => s.showToast);
  const gender = guardianGender(g.relationship);
  const list = permissionList(t, g.permissions);
  const paused = g.status === 'paused';
  const failed = () => showToast({ message: t('common.states.error'), tone: 'danger' });

  const pause = () => {
    if (paused) return;
    update.mutate(
      { id: g.id, body: { paused: true } },
      { onSuccess: () => showToast({ message: t('family.guardians.paused', { name: g.name }) }), onError: failed },
    );
  };
  const resume = () => {
    // The server returns a guardian who never accepted to "invited", not "active".
    update.mutate(
      { id: g.id, body: { paused: false } },
      { onSuccess: () => showToast({ message: t('family.guardians.resumed', { name: g.name }), tone: 'success' }), onError: failed },
    );
  };
  const simulateAccept = () => {
    simulate.mutate(g.id, {
      onSuccess: () => showToast({ message: ts('family.guardians.markedActive', gender, { name: g.name }), tone: 'success' }),
      onError: failed,
    });
  };

  return (
    <Card style={paused ? { opacity: 0.85 } : undefined}>
      <View testID={`family-guardian-${g.id}`} style={{ gap: spacing.md }}>
        <View style={styles.head}>
          <Avatar id={g.id} name={g.name} size={48} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="subheading" numberOfLines={1}>
              {g.name}
            </Text>
            <View style={styles.tags}>
              <Text variant="small" color={colors.textMuted}>
                {t(`family.invite.relationships.${g.relationship}`)}
              </Text>
              <Tag
                tone={STATUS_TONE[g.status]}
                icon={STATUS_ICON[g.status]}
                label={ts(`family.guardians.status.${g.status}`, gender)}
              />
            </View>
          </View>
        </View>

        <View style={styles.summary}>
          <Icon name="eye-outline" size={16} color={colors.textMuted} style={{ marginTop: 2 }} />
          <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
            {list
              ? ts('family.guardians.permissionSummary', gender, { list })
              : ts('family.guardians.permissionSummaryNone', gender)}
          </Text>
        </View>
        {g.status === 'invited' ? (
          <Text variant="caption" color={colors.textSubtle}>
            {ts('family.guardians.invitedHint', gender)}
          </Text>
        ) : null}
        {paused ? (
          <Text variant="caption" color={colors.textSubtle}>
            {ts('family.guardians.pauseHint', gender)}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Button label={t('family.guardians.permissionsEdit')} icon="options-outline" variant="secondary" size="sm" onPress={onEdit} testID={`family-guardian-edit-${g.id}`} />
          {paused ? (
            <Button label={t('family.guardians.resume')} icon="play-outline" variant="outline" size="sm" loading={update.isPending} onPress={resume} testID={`family-guardian-resume-${g.id}`} />
          ) : (
            <Button label={t('family.guardians.pause')} icon="pause-outline" variant="outline" size="sm" loading={update.isPending} onPress={pause} testID={`family-guardian-pause-${g.id}`} />
          )}
          <Button label={t('family.guardians.remove')} icon="person-remove-outline" variant="danger" size="sm" onPress={onRemove} testID={`family-guardian-remove-${g.id}`} />
        </View>
        {!g.accepted ? (
          <View style={styles.actions}>
            <Button
              label={t('family.guardians.shareAgain')}
              icon="share-social-outline"
              variant="ghost"
              size="sm"
              loading={sharing}
              onPress={onShareAgain}
              testID={`family-guardian-share-${g.id}`}
            />
            {api.dev ? (
              <Button
                label={t('family.guardians.markActive')}
                icon="flask-outline"
                variant="ghost"
                size="sm"
                loading={simulate.isPending}
                onPress={simulateAccept}
                testID={`family-guardian-accept-${g.id}`}
              />
            ) : null}
          </View>
        ) : null}
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  tags: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  summary: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
