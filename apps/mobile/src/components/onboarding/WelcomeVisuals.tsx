import { StyleSheet, View } from 'react-native';

import { Avatar, Card, CompatRing, Icon, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, palette, radii, spacing } from '@/theme';

import { HALAL_MODE_ICONS, HALAL_MODES } from './draft';

/** Static sample of the "Why we match" card (welcome card 2). */
export function WhyWeMatchSample() {
  const t = useT();
  const reasons = ['reason1', 'reason2', 'reason3'] as const;
  return (
    <Card style={styles.sample}>
      <View style={styles.sampleHead}>
        <Avatar id="sample-maryam" name="M" photoState="blurred" size={44} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="overline" color={colors.textMuted}>
            {t('onboarding.welcome.sample.label')}
          </Text>
          <Text variant="subheading">{t('onboarding.welcome.sample.title')}</Text>
        </View>
        <CompatRing pct={91} size={56} stroke={5} />
      </View>
      <View style={{ gap: spacing.sm }}>
        {reasons.map((r) => (
          <View key={r} style={styles.line}>
            <View style={styles.tick}>
              <Icon name="checkmark" size={12} color={palette.white} />
            </View>
            <Text variant="small" style={{ flex: 1 }}>
              {t(`onboarding.welcome.sample.${r}`)}
            </Text>
          </View>
        ))}
        <View style={[styles.line, styles.discuss]}>
          <Icon name="chatbubble-ellipses-outline" size={15} color={colors.discuss} />
          <Text variant="small" color="#9A5E12" style={{ flex: 1 }}>
            {t('onboarding.welcome.sample.discuss')}
          </Text>
        </View>
      </View>
    </Card>
  );
}

/** The three Halal Mode levels, stacked (welcome card 3). */
export function HalalModeLevels() {
  const t = useT();
  return (
    <View style={{ gap: spacing.sm }}>
      {HALAL_MODES.map((m, i) => (
        <View key={m} style={styles.level}>
          <View style={[styles.levelIcon, { backgroundColor: i === 2 ? colors.premiumSoft : colors.primaryTint }]}>
            <Icon name={HALAL_MODE_ICONS[m]} size={20} color={i === 2 ? '#8A6A22' : colors.primary} />
          </View>
          <View style={{ flex: 1, gap: 1 }}>
            <Text variant="caption" color={colors.textMuted}>
              {t('onboarding.halalMode.level', { n: i + 1 })}
            </Text>
            <Text variant="bodyStrong">{t(`common.halalMode.${m}`)}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}

/** Three short value points (welcome card 1). */
export function WelcomePoints() {
  const t = useT();
  const points = [
    { key: 'point1', icon: 'heart-outline' },
    { key: 'point2', icon: 'shield-checkmark-outline' },
    { key: 'point3', icon: 'chatbubbles-outline' },
  ] as const;
  return (
    <View style={{ gap: spacing.md }}>
      {points.map((p) => (
        <View key={p.key} style={styles.level}>
          <View style={[styles.levelIcon, { backgroundColor: colors.primaryTint }]}>
            <Icon name={p.icon} size={20} color={colors.primary} />
          </View>
          <Text variant="bodyStrong" style={{ flex: 1 }}>
            {t(`onboarding.welcome.${p.key}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  sample: { gap: spacing.md, padding: spacing.lg },
  sampleHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tick: { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  discuss: { backgroundColor: colors.discussSoft, borderRadius: radii.md, paddingHorizontal: spacing.sm, paddingVertical: spacing.sm, marginTop: spacing.xs },
  level: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    padding: spacing.md,
  },
  levelIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
