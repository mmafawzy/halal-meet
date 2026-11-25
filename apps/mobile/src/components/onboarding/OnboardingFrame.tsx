import { router } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { IconButton, Icon, ProgressBar, Screen, Text, type IconName } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession, type OnboardingStep } from '@/state/session';
import { colors, MAX_CONTENT_WIDTH, palette, spacing } from '@/theme';

import { draftStrength, FLOW, previousStep } from './draft';

export interface OnboardingFrameProps {
  /** Route name of this step; saved on mount so the app can resume here. */
  step: OnboardingStep;
  title: string;
  subtitle?: string;
  children: ReactNode;
  /** Sticky CTA area. */
  footer?: ReactNode;
  /** Trailing header slot (e.g. a "Skip" link). */
  right?: ReactNode;
  scroll?: boolean;
  keyboard?: boolean;
  /** Show the "Profile strength" hint line (default: from the intention step on). */
  showStrength?: boolean;
  /** Hide the back button. */
  hideBack?: boolean;
  onBack?: () => void;
}

/**
 * Shared chrome for onboarding steps: back button, slim progress bar, title / subtitle,
 * the "Profile strength" hint and a sticky footer.
 */
export function OnboardingFrame({
  step,
  title,
  subtitle,
  children,
  footer,
  right,
  scroll = true,
  keyboard = false,
  showStrength,
  hideBack,
  onBack,
}: OnboardingFrameProps) {
  const t = useT();
  const setStep = useSession((s) => s.setStep);
  const strength = useSession((s) => draftStrength(s.draft));

  useEffect(() => {
    setStep(step);
  }, [step, setStep]);

  const index = FLOW.indexOf(step);
  const total = FLOW.length;
  const strengthVisible = showStrength ?? index >= FLOW.indexOf('intention');
  const prev = previousStep(step);
  const canBack = !hideBack && (router.canGoBack() || prev !== null);

  const goBack = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else if (prev) router.replace(`/(onboarding)/${prev}`);
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.side}>
        {canBack ? <IconButton name="chevron-back" directional accessibilityLabel={t('common.actions.back')} onPress={goBack} /> : null}
      </View>
      <View style={styles.progress} accessibilityLabel={t('onboarding.frame.progress', { n: index + 1, total })}>
        {index >= 0 ? <ProgressBar value={(index + 1) / total} style={{ height: 4 }} /> : null}
      </View>
      <View style={[styles.side, styles.end]}>{right}</View>
    </View>
  );

  return (
    <Screen header={header} footer={footer} scroll={scroll} keyboard={keyboard}>
      <View style={styles.titleBlock}>
        <Text variant="title">{title}</Text>
        {subtitle ? (
          <Text variant="body" color={colors.textMuted}>
            {subtitle}
          </Text>
        ) : null}
        {strengthVisible ? (
          <View style={styles.strength}>
            <Icon name="sparkles" size={14} color={palette.gold500} />
            <Text variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
              <Text variant="caption" weight="semibold" color={colors.text}>
                {t('onboarding.frame.strength', { pct: strength })}
              </Text>
              {'  ·  '}
              {t('onboarding.frame.strengthHint')}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={scroll ? styles.body : [styles.body, { flex: 1 }]}>{children}</View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.sm,
    minHeight: 52,
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
  },
  side: { minWidth: 48, flexDirection: 'row', alignItems: 'center' },
  end: { justifyContent: 'flex-end' },
  progress: { flex: 1, paddingHorizontal: spacing.sm },
  titleBlock: { gap: spacing.sm, marginBottom: spacing.xl },
  strength: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xs,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    backgroundColor: colors.premiumSoft,
    alignSelf: 'flex-start',
  },
  body: { gap: spacing.lg },
});

/** Inline validation / info line used across steps. */
export function InlineNote({ text, tone = 'muted', icon }: { text: string; tone?: 'muted' | 'danger' | 'primary'; icon?: IconName }) {
  const color = tone === 'danger' ? colors.danger : tone === 'primary' ? colors.primary : colors.textMuted;
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
      <Icon name={icon ?? (tone === 'danger' ? 'alert-circle-outline' : 'information-circle-outline')} size={16} color={color} style={{ marginTop: 2 }} />
      <Text variant="small" color={color} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}
