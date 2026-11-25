import type { HalalMode } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { HALAL_MODES, HALAL_MODE_ICONS } from '@/components/onboarding/draft';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Button, Chip, ChipRow, Icon, Sheet, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * Screen 7 — Halal Mode: the interaction model (three illustrated cards) plus the multi-select of
 * modes the user is comfortable matching with, and the neutral "is this religiously required?"
 * explainer (spec README §5 — the app never issues rulings).
 */
export default function HalalModeScreen() {
  const t = useT();
  const draftMode = useSession((s) => s.draft.halalMode);
  const draftAccepted = useSession((s) => s.draft.acceptedModes);
  const updateDraft = useSession((s) => s.updateDraft);

  const [mode, setMode] = useState<HalalMode | null>(draftMode);
  const [accepted, setAccepted] = useState<HalalMode[]>(draftAccepted);
  const [infoOpen, setInfoOpen] = useState(false);

  // The chosen mode can never be excluded, and the levels keep their natural order.
  const effectiveAccepted = mode ? HALAL_MODES.filter((m) => m === mode || accepted.includes(m)) : HALAL_MODES.filter((m) => accepted.includes(m));

  const chooseMode = (m: HalalMode) => {
    setMode(m);
    setAccepted((a) => (a.includes(m) ? a : [...a, m]));
  };

  const toggleAccepted = (m: HalalMode) => {
    if (m === mode) return;
    setAccepted((a) => (a.includes(m) ? a.filter((x) => x !== m) : [...a, m]));
  };

  const next = () => {
    if (!mode) return;
    updateDraft({ halalMode: mode, acceptedModes: effectiveAccepted });
    router.push('/(onboarding)/basics');
  };

  return (
    <OnboardingFrame
      step="halal-mode"
      title={t('onboarding.halalMode.title')}
      subtitle={t('onboarding.halalMode.subtitle')}
      footer={
        <Button
          label={t('common.actions.continue')}
          size="lg"
          fullWidth
          disabled={!mode}
          onPress={next}
          testID="halal-mode-continue"
        />
      }
    >
      <View style={{ gap: spacing.md }}>
        {HALAL_MODES.map((m, i) => {
          const selected = mode === m;
          const premium = m === 'wali';
          return (
            <Pressable
              key={m}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected }}
              accessibilityLabel={t(`common.halalMode.${m}`)}
              onPress={() => chooseMode(m)}
              style={({ pressed }) => [styles.card, selected && styles.cardOn, pressed && !selected && { backgroundColor: palette.sand100 }]}
              testID={`halal-mode-${m}`}
            >
              <View style={styles.cardHead}>
                <View style={[styles.icon, premium ? { backgroundColor: colors.premiumSoft } : null, selected && !premium && { backgroundColor: colors.primary }]}>
                  <Icon name={HALAL_MODE_ICONS[m]} size={22} color={selected && !premium ? palette.white : premium ? '#8A6A22' : colors.primary} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="overline" color={colors.textMuted}>
                    {t('onboarding.halalMode.level', { n: i + 1 })}
                  </Text>
                  <Text variant="subheading">{t(`common.halalMode.${m}`)}</Text>
                </View>
                <View style={[styles.radio, selected && styles.radioOn]}>{selected ? <Icon name="checkmark" size={14} color={palette.white} /> : null}</View>
              </View>

              <Text variant="small" color={colors.textMuted}>
                {t(`common.halalModeDesc.${m}`)}
              </Text>

              {/* Illustrated behaviour summary — plain language, no religious claims. */}
              <View style={styles.bullets}>
                {[1, 2, 3].map((n) => (
                  <View key={n} style={styles.bullet}>
                    <Icon name="checkmark" size={13} color={colors.primary} />
                    <Text variant="caption" style={{ flex: 1 }} color={colors.textMuted}>
                      {t(`onboarding.halalMode.mode.${m}.b${n}`)}
                    </Text>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}
      </View>

      <Pressable accessibilityRole="button" onPress={() => setInfoOpen(true)} style={styles.link}>
        <Icon name="help-circle-outline" size={16} color={colors.primary} />
        <Text variant="small" weight="semibold" color={colors.primary}>
          {t('onboarding.halalMode.requiredLink')}
        </Text>
      </Pressable>

      <View style={{ gap: spacing.sm }}>
        <Text variant="subheading">{t('onboarding.halalMode.acceptTitle')}</Text>
        <ChipRow>
          {HALAL_MODES.map((m) => (
            <Chip
              key={m}
              label={t(`common.halalMode.${m}`)}
              selected={effectiveAccepted.includes(m)}
              disabled={m === mode}
              onPress={() => toggleAccepted(m)}
            />
          ))}
        </ChipRow>
        <Text variant="caption" color={colors.textSubtle}>
          {t('onboarding.halalMode.acceptHint')}
        </Text>
      </View>

      <Sheet
        visible={infoOpen}
        onClose={() => setInfoOpen(false)}
        title={t('onboarding.halalMode.sheetTitle')}
        footer={<Button label={t('common.actions.gotIt')} fullWidth onPress={() => setInfoOpen(false)} />}
      >
        <Text variant="body" color={colors.textMuted}>
          {t('onboarding.halalMode.sheetBody1')}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {t('onboarding.halalMode.sheetBody2')}
        </Text>
        <Text variant="body" color={colors.textMuted}>
          {t('onboarding.halalMode.sheetBody3')}
        </Text>
        <InlineNote tone="muted" text={t('onboarding.halalMode.disclaimer')} />
      </Sheet>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  cardOn: { borderColor: colors.primary, backgroundColor: colors.primaryTint },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: palette.navy300, alignItems: 'center', justifyContent: 'center' },
  radioOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  bullets: { gap: 6, marginTop: spacing.xs },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  link: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, alignSelf: 'flex-start', paddingVertical: spacing.xs },
});
