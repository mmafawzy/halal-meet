import {
  defaultGuardianPermissions,
  type GuardianInviteResponse,
  type GuardianPermissions,
  type GuardianRelationship,
  type HalalMode,
} from '@halal-meet/core';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { useInviteGuardian } from '@/api/hooks';
import { Button, Chip, ChipRow, Field, Icon, PreviewBadge, Sheet, Text, TextField } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, radii, spacing } from '@/theme';

import { PermissionToggles } from './PermissionToggles';
import { copyText, guardianGender, inviteLink, RELATIONSHIPS, shareText } from './shared';

/**
 * Invite flow (spec 01 §44): name → relationship → permissions (defaulted from the user's Halal Mode)
 * → POST /guardians → share sheet with the invitation message and the real one-time link. With `share`
 * it opens straight on the share step ("Send the invitation again": the code was just re-issued).
 */
export function InviteSheet({
  visible,
  onClose,
  mode,
  share,
}: {
  visible: boolean;
  onClose: () => void;
  mode: HalalMode;
  share?: GuardianInviteResponse | null;
}) {
  const t = useT();
  const ts = useTs();
  const invite = useInviteGuardian();
  const showToast = useUi((s) => s.showToast);

  const [name, setName] = useState('');
  const [relationship, setRelationship] = useState<GuardianRelationship | null>(null);
  const [perms, setPerms] = useState<GuardianPermissions>(() => defaultGuardianPermissions(mode));
  const [created, setCreated] = useState<GuardianInviteResponse | null>(null);

  // Fresh form every time the sheet opens (and on the share step when re-sending an invitation).
  useEffect(() => {
    if (!visible) return;
    setName('');
    setRelationship(null);
    setPerms(defaultGuardianPermissions(mode));
    setCreated(share ?? null);
    invite.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, mode, share]);

  const trimmed = name.trim();
  const canSend = trimmed.length > 0 && relationship !== null;

  const send = () => {
    if (!canSend || !relationship || invite.isPending) return;
    invite.mutate(
      { name: trimmed, relationship, permissions: perms },
      {
        onSuccess: (res) => {
          setCreated(res);
          showToast({ message: t('family.invite.sent'), tone: 'success', durationMs: 2200 });
        },
        onError: () => showToast({ message: t('family.invite.sendFailed'), tone: 'danger' }),
      },
    );
  };

  if (created) {
    const guardian = created.guardian;
    const link = inviteLink(created.inviteCode);
    const message = t('family.invite.shareMessage', { name: guardian.name, link });
    const copy = async () => {
      const ok = await copyText(message);
      showToast(ok ? { message: t('family.invite.copied'), tone: 'success', durationMs: 1800 } : { message: t('family.invite.copyUnavailable') });
    };
    const shareNative = async () => {
      const ok = await shareText(message);
      if (!ok) await copy();
    };
    return (
      <Sheet
        visible={visible}
        onClose={onClose}
        title={t('family.invite.shareSheetTitle')}
        subtitle={t('family.invite.shareHint')}
        testID="family-share-sheet"
        footer={
          <>
            <Button label={t('family.actions.share')} icon="share-social-outline" fullWidth onPress={() => void shareNative()} testID="family-share-native" />
            <Button label={t('family.invite.copy')} icon="copy-outline" variant="outline" fullWidth onPress={() => void copy()} testID="family-share-copy" />
            <Button label={t('common.actions.done')} variant="ghost" fullWidth onPress={onClose} testID="family-share-done" />
          </>
        }
      >
        {api.dev ? <PreviewBadge label={t('family.previewLabel')} /> : null}
        <View style={styles.message}>
          <Text variant="body" selectable testID="family-share-message">
            {message}
          </Text>
        </View>
        <View style={{ gap: spacing.xs }}>
          <Text variant="small" weight="semibold" color={colors.textMuted}>
            {t('family.invite.linkLabel')}
          </Text>
          <View style={styles.link}>
            <Icon name="link-outline" size={16} color={colors.primary} />
            <Text variant="small" fontLocale="en" selectable style={{ flex: 1, writingDirection: 'ltr' }} numberOfLines={1} testID="family-share-link">
              {link}
            </Text>
          </View>
          <Text variant="caption" color={colors.textSubtle}>
            {t('family.invite.linkPreviewNote')}
          </Text>
          {api.dev ? (
            <View style={{ gap: spacing.xs }}>
              <Text variant="caption" color={colors.textSubtle}>
                {t('family.invite.linkDemoNote')}
              </Text>
              <Button
                label={t('family.guardianSide.invite.title')}
                icon="open-outline"
                variant="ghost"
                size="sm"
                style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                onPress={() => {
                  onClose();
                  router.push({ pathname: '/guardian/[code]', params: { code: created.inviteCode } });
                }}
                testID="family-share-open-link"
              />
            </View>
          ) : null}
        </View>
        <Text variant="caption" color={colors.textMuted}>
          {ts('family.invite.sentBody', guardianGender(guardian.relationship), { name: guardian.name })}
        </Text>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('family.invite.title')}
      subtitle={t('family.invite.body')}
      testID="family-invite-sheet"
      footer={
        <>
          <Button
            label={t('family.invite.sendButton')}
            icon="paper-plane-outline"
            directionalIcon
            fullWidth
            disabled={!canSend}
            loading={invite.isPending}
            onPress={send}
            testID="family-invite-send"
          />
          <Button label={t('family.invite.skip')} variant="ghost" fullWidth onPress={onClose} testID="family-invite-skip" />
        </>
      }
    >
      {api.dev ? <PreviewBadge label={t('family.previewLabel')} /> : null}
      <Field label={t('family.invite.nameLabel')}>
        <TextField
          value={name}
          onChangeText={setName}
          placeholder={t('family.invite.namePlaceholder')}
          autoCapitalize="words"
          maxLength={40}
          returnKeyType="done"
          testID="family-invite-name"
        />
      </Field>
      <Field label={t('family.invite.relationship')} hint={t('family.invite.relationshipHint')}>
        <ChipRow>
          {RELATIONSHIPS.map((r) => (
            <View key={r} testID={`family-invite-rel-${r}`}>
              <Chip label={t(`family.invite.relationships.${r}`)} selected={relationship === r} onPress={() => setRelationship(r)} />
            </View>
          ))}
        </ChipRow>
      </Field>
      <View style={{ gap: spacing.xs }}>
        <Text variant="subheading">{t('family.invite.permissions')}</Text>
        <Text variant="caption" color={colors.textMuted}>
          {t('family.invite.permissionsHint', { mode: t(`common.halalMode.${mode}`) })}
        </Text>
      </View>
      <PermissionToggles value={perms} onChange={setPerms} />
      <Text variant="caption" color={colors.textSubtle}>
        {t('family.disclosure.short')}
      </Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  message: { backgroundColor: colors.bgMuted, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.borderSoft },
  link: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
});
