import type { Locale } from '@halal-meet/core';
import { getLocales } from 'expo-localization';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Screen, Star, Text, Wordmark } from '@/components/ui';
import { useT } from '@/i18n';
import { applyLocale } from '@/i18n/rtl';
import { useSession } from '@/state/session';
import { colors, palette, radii, shadow, spacing } from '@/theme';

function deviceLocale(): Locale {
  try {
    return getLocales()[0]?.languageCode === 'ar' ? 'ar' : 'en';
  } catch {
    return 'en';
  }
}

/** Screen 2 — language selection. Bilingual on purpose: shown before any language is chosen. */
export default function LanguageScreen() {
  const t = useT();
  const setStep = useSession((s) => s.setStep);
  const suggested = useMemo(deviceLocale, []);
  const [busy, setBusy] = useState<Locale | null>(null);

  useEffect(() => {
    setStep('language');
  }, [setStep]);

  const choose = async (locale: Locale) => {
    if (busy) return;
    setBusy(locale);
    setStep('welcome');
    // On native this may restart the app to flip RTL; the splash gate then routes to welcome.
    const reloading = await applyLocale(locale);
    if (!reloading) router.replace('/(onboarding)/welcome');
  };

  // Arabic first when the device is Arabic, otherwise English first.
  const order: Locale[] = suggested === 'ar' ? ['ar', 'en'] : ['en', 'ar'];

  return (
    <Screen pattern scroll={false}>
      <View style={styles.hero}>
        <Star size={44} />
        <Wordmark size={28} />
        <Text variant="body" color={colors.textMuted} center fontLocale={suggested}>
          {t('common.tagline', { lng: suggested })}
        </Text>
      </View>

      <View style={styles.choices}>
        <View style={{ gap: 2, marginBottom: spacing.sm }}>
          <Text variant="heading" center fontLocale="ar">
            {t('onboarding.language.title', { lng: 'ar' })}
          </Text>
          <Text variant="small" color={colors.textMuted} center fontLocale="en">
            {t('onboarding.language.title', { lng: 'en' })}
          </Text>
        </View>
        {order.map((l) => {
          const isSuggested = l === suggested;
          return (
            <Pressable
              key={l}
              testID={`language-${l}`}
              accessibilityRole="button"
              accessibilityLabel={t(l === 'ar' ? 'onboarding.language.arabic' : 'onboarding.language.english')}
              onPress={() => void choose(l)}
              style={({ pressed }) => [styles.choice, isSuggested && styles.choiceSuggested, pressed && { opacity: 0.9 }]}
            >
              <View style={{ flex: 1, gap: 4 }}>
                <Text fontLocale={l} weight="bold" style={{ fontSize: 24, lineHeight: l === 'ar' ? 36 : 30 }}>
                  {t(l === 'ar' ? 'onboarding.language.arabic' : 'onboarding.language.english', { lng: l })}
                </Text>
                <Text variant="small" color={colors.textMuted} fontLocale={l}>
                  {t('common.tagline', { lng: l })}
                </Text>
              </View>
              {busy === l ? (
                <ActivityIndicator color={colors.primary} />
              ) : isSuggested ? (
                <View style={styles.badge}>
                  <Text variant="caption" color={colors.primary} fontLocale={l}>
                    {t('onboarding.language.suggested', { lng: l })}
                  </Text>
                </View>
              ) : null}
            </Pressable>
          );
        })}
        <Text variant="caption" color={colors.textSubtle} center fontLocale={suggested}>
          {t('onboarding.language.subtitle', { lng: suggested })}
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.lg, paddingHorizontal: spacing.lg },
  choices: { gap: spacing.md, paddingBottom: spacing.xl },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 88,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    ...shadow.soft,
  },
  choiceSuggested: { borderColor: colors.primary },
  badge: { backgroundColor: colors.primaryTint, borderRadius: radii.pill, paddingHorizontal: spacing.sm + 2, paddingVertical: 3, borderWidth: 1, borderColor: palette.emerald100 },
});
