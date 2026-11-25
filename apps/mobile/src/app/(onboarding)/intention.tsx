import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { INTENTIONS, INTENTION_ICONS } from '@/components/onboarding/draft';
import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { useOnboardingSave } from '@/components/onboarding/useOnboardingSave';
import { Button, OptionCard, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, spacing } from '@/theme';

/** Screen 6 — the mandatory marriage-intention gate. */
export default function IntentionScreen() {
  const t = useT();
  const draftIntention = useSession((s) => s.draft.intention);
  const updateDraft = useSession((s) => s.updateDraft);
  const { save, saving } = useOnboardingSave();
  const [intention, setIntention] = useState(draftIntention);

  const next = async () => {
    if (!intention) return;
    updateDraft({ intention });
    await save({ intention });
    router.push('/(onboarding)/halal-mode');
  };

  return (
    <OnboardingFrame
      step="intention"
      title={t('onboarding.intention.title')}
      subtitle={t('onboarding.intention.subtitle')}
      hideBack
      footer={
        <Button
          label={t('common.actions.continue')}
          size="lg"
          fullWidth
          loading={saving}
          disabled={!intention}
          onPress={() => void next()}
          testID="intention-continue"
        />
      }
    >
      <View style={{ gap: spacing.md }}>
        {INTENTIONS.map((i) => (
          <OptionCard
            key={i}
            icon={INTENTION_ICONS[i]}
            title={t(`common.intention.${i}`)}
            selected={intention === i}
            onPress={() => setIntention(i)}
          />
        ))}
      </View>

      {intention === 'unsure' ? <InlineNote text={t('onboarding.intention.unsureNote')} /> : null}

      <Text variant="caption" color={colors.textSubtle}>
        {t('onboarding.intention.hint')}
      </Text>
    </OnboardingFrame>
  );
}
