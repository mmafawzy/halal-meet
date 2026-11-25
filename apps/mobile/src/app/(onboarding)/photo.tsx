import type { PhotoVisibility } from '@halal-meet/core';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { PHOTO_VISIBILITIES, PHOTO_VISIBILITY_ICONS, previewPhotoState } from '@/components/onboarding/draft';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { useOnboardingSave } from '@/components/onboarding/useOnboardingSave';
import { Avatar, Button, Card, Icon, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * Screen 10 — photo + photo privacy.
 *
 * The contract has no upload route yet, so the picked photo stays on the device and only its URI is
 * kept in the draft. The preview below shows exactly what an introduction sees for each visibility
 * level, including the honest note that a verified photo is never shown without permission.
 */
export default function PhotoScreen() {
  const t = useT();
  const draftUri = useSession((s) => s.draft.photoUri);
  const draftVisibility = useSession((s) => s.draft.photoVisibility);
  const firstName = useSession((s) => s.draft.firstName);
  const userId = useSession((s) => s.accountId);
  const updateDraft = useSession((s) => s.updateDraft);
  const { save, saving } = useOnboardingSave();

  const [uri, setUri] = useState(draftUri);
  const [visibility, setVisibility] = useState<PhotoVisibility>(draftVisibility);
  const [denied, setDenied] = useState(false);

  const pick = async () => {
    setDenied(false);
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setDenied(true);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.8,
    });
    const asset = result.assets?.[0];
    if (!result.canceled && asset) setUri(asset.uri);
  };

  const next = async () => {
    updateDraft({ photoUri: uri, photoVisibility: visibility });
    const ok = await save({ photoUri: uri, photoVisibility: visibility });
    if (ok) router.push('/(onboarding)/religion');
  };

  const state = previewPhotoState(visibility);
  const name = firstName.trim() || t('common.actions.save');

  return (
    <OnboardingFrame
      step="photo"
      title={t('onboarding.photo.title')}
      subtitle={t('onboarding.photo.subtitle')}
      showStrength={false}
      footer={
        <>
          <Button label={t('common.actions.continue')} size="lg" fullWidth loading={saving} onPress={() => void next()} testID="photo-continue" />
          {/* Adding a photo is optional — nobody is trapped here. */}
          <Button label={t('onboarding.photo.skip')} variant="ghost" fullWidth onPress={() => void next()} />
        </>
      }
    >
      <Card>
        <View style={styles.previewHead}>
          <Avatar id={userId ?? 'me'} name={name} photoUrl={uri} photoState={state} size={92} shape="rounded" />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <Text variant="overline" color={colors.textMuted}>
              {t('onboarding.photo.previewLabel')}
            </Text>
            <Text variant="small" color={colors.textMuted}>
              {t(`common.photoVisibilityDesc.${visibility}`)}
            </Text>
            <View style={styles.statePill}>
              <Icon
                name={state === 'visible' ? 'eye-outline' : state === 'blurred' ? 'lock-closed-outline' : 'people-outline'}
                size={13}
                color={colors.primary}
              />
              <Text variant="caption" color={colors.primary}>
                {t(`onboarding.photo.state.${state}`)}
              </Text>
            </View>
          </View>
        </View>
      </Card>

      <View style={{ gap: spacing.sm }}>
        <Button
          label={uri ? t('onboarding.photo.change') : t('onboarding.photo.choose')}
          variant="secondary"
          icon="camera-outline"
          fullWidth
          onPress={() => void pick()}
          testID="photo-pick"
        />
        {denied ? <InlineNote tone="danger" text={t('onboarding.photo.permissionDenied')} /> : null}
        <InlineNote tone="muted" text={t('onboarding.photo.verifiedNote')} />
      </View>

      <View style={{ gap: spacing.md }}>
        <Text variant="subheading">{t('onboarding.photo.visibility')}</Text>
        {PHOTO_VISIBILITIES.map((v) => {
          const selected = visibility === v;
          return (
            <Pressable
              key={v}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={t(`common.photoVisibility.${v}`)}
              onPress={() => setVisibility(v)}
              style={({ pressed }) => [styles.option, selected && styles.optionOn, pressed && !selected && { backgroundColor: palette.sand100 }]}
              testID={`photo-visibility-${v}`}
            >
              <View style={[styles.icon, selected && { backgroundColor: colors.primary }]}>
                <Icon name={PHOTO_VISIBILITY_ICONS[v]} size={18} color={selected ? palette.white : colors.primary} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text variant="bodyStrong">{t(`common.photoVisibility.${v}`)}</Text>
                <Text variant="small" color={colors.textMuted}>
                  {t(`common.photoVisibilityDesc.${v}`)}
                </Text>
              </View>
              <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="checkmark" size={14} color={palette.white} /> : null}</View>
            </Pressable>
          );
        })}
      </View>

      <InlineNote text={t('onboarding.photo.hint')} />
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  previewHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  statePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    backgroundColor: colors.primaryTint,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  optionOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  icon: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
});
