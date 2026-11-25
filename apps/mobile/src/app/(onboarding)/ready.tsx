import { router } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTopPicks } from '@/api/hooks';
import { useOnboardingSave } from '@/components/onboarding/useOnboardingSave';
import { Avatar, Button, Icon, Screen, Star, Text, Wordmark } from '@/components/ui';
import { useT } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * End of onboarding — "Your first introductions are ready" celebration (spec 01 §20 → Home).
 * Marks onboarding complete on entry (the splash gate then always routes to Discover) and previews
 * today's Top Picks before handing over to the Discover tab.
 */
export default function ReadyScreen() {
  const t = useT();
  const completeOnboarding = useSession((s) => s.completeOnboarding);
  const { save } = useOnboardingSave();
  const picks = useTopPicks();

  useEffect(() => {
    // Make sure the latest profile is on the server, then mark onboarding as done.
    void save().finally(() => completeOnboarding());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const cards = picks.data?.cards ?? [];
  const preview = cards.slice(0, 3);

  const start = () => {
    completeOnboarding();
    router.replace('/(tabs)/discover');
  };

  return (
    <Screen
      pattern
      footer={<Button label={t('onboarding.ready.cta')} size="lg" fullWidth iconEnd="arrow-forward" directionalIcon onPress={start} testID="ready-start" />}
      contentStyle={styles.content}
    >
      <View style={styles.top}>
        <Wordmark />
      </View>

      <View style={styles.hero}>
        <View style={styles.badge}>
          <Star size={34} color={palette.gold500} />
        </View>
        <Text variant="display" center>
          {t('onboarding.ready.title')}
        </Text>
        <Text variant="body" color={colors.textMuted} center style={{ maxWidth: 360 }}>
          {t('onboarding.ready.subtitle')}
        </Text>
      </View>

      <View style={styles.picks} testID="ready-picks">
        {picks.isLoading ? (
          <ActivityIndicator color={colors.primary} />
        ) : preview.length > 0 ? (
          <>
            <View style={styles.avatars}>
              {preview.map((c, i) => (
                <View key={c.id} style={[styles.avatarWrap, i > 0 && { marginStart: -18 }]}>
                  <Avatar id={c.id} name={c.firstName} photoUrl={c.photoUrl} photoState={c.photoState} size={64} ring={palette.white} />
                </View>
              ))}
            </View>
            <Text variant="bodyStrong" center>
              {t('onboarding.ready.picks', { n: cards.length })}
            </Text>
          </>
        ) : (
          <>
            <View style={styles.emptyIcon}>
              <Icon name="compass-outline" size={26} color={colors.primary} />
            </View>
            <Text variant="bodyStrong" center>
              {t('onboarding.ready.empty')}
            </Text>
          </>
        )}
      </View>

      <View style={styles.note}>
        <Icon name="moon-outline" size={16} color={colors.textMuted} />
        <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
          {t('onboarding.ready.note')}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.xxl, paddingTop: spacing.lg },
  top: { alignItems: 'center' },
  hero: { alignItems: 'center', gap: spacing.md, marginTop: spacing.xl },
  badge: {
    width: 76,
    height: 76,
    borderRadius: 38,
    backgroundColor: colors.premiumSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  picks: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    borderRadius: radii.xl,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    minHeight: 140,
    justifyContent: 'center',
  },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  avatarWrap: { borderRadius: 34 },
  emptyIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, justifyContent: 'center', paddingHorizontal: spacing.lg },
});
