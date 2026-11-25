import type { FeedPage } from '@halal-meet/core';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMe } from '@/api/hooks';
import { Button, Card, Icon, type IconName, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { countryFlag, countryName } from '@/lib/format';
import { colors, palette, radii, spacing } from '@/theme';

/** End of pool (small markets): honest message, ways to widen, and live Passport counts. */
export function EndOfPool({ suggestions }: { suggestions: FeedPage['passportSuggestions'] }) {
  const t = useT();
  const locale = useLocale();
  const me = useMe();
  const capacity = me.data?.entitlements.passport.capacity ?? 0;

  const actions: Array<{ icon: IconName; label: string; href: '/settings/preferences' | '/settings/questions' }> = [
    { icon: 'options-outline', label: t('discover.end.actions.preferences'), href: '/settings/preferences' },
    { icon: 'git-compare-outline', label: t('discover.end.actions.flex'), href: '/settings/questions' },
    { icon: 'help-circle-outline', label: t('discover.end.actions.questions'), href: '/settings/questions' },
  ];

  const openCountry = (country: string) => {
    if (capacity > 0) router.push({ pathname: '/passport/activate', params: { country } });
    else router.push({ pathname: '/passport', params: { country } });
  };

  return (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.xxxl }} testID="end-of-pool">
      <View style={{ alignItems: 'center', gap: spacing.sm, paddingTop: spacing.md }}>
        <View style={styles.moon}>
          <Icon name="moon-outline" size={24} color={colors.primary} />
        </View>
        <Text variant="heading" center>
          {t('discover.end.title')}
        </Text>
        <Text variant="small" color={colors.textMuted} center>
          {t('discover.end.body')}
        </Text>
      </View>

      <Card padded={false}>
        {actions.map((a, i) => (
          <Pressable
            key={a.label}
            accessibilityRole="button"
            onPress={() => router.push(a.href)}
            style={({ pressed }) => [styles.action, i > 0 && styles.sep, pressed && { backgroundColor: palette.sand100 }]}
          >
            <Icon name={a.icon} size={18} color={colors.primary} />
            <Text variant="body" style={{ flex: 1 }}>
              {a.label}
            </Text>
            <Icon name="chevron-forward" directional size={16} color={colors.textSubtle} />
          </Pressable>
        ))}
      </Card>

      {suggestions.length > 0 ? (
        <Card style={{ gap: spacing.md, backgroundColor: '#EAF0F7', borderColor: '#D6E1EE' }}>
          <View style={{ gap: 2 }}>
            <Text variant="subheading">{t('discover.end.passportTitle')}</Text>
            <Text variant="small" color={colors.textMuted}>
              {t('discover.end.passportBody')}
            </Text>
          </View>
          {suggestions.slice(0, 4).map((s) => (
            <View key={s.country} style={styles.country}>
              <Text variant="heading" fontLocale="en">
                {countryFlag(s.country)}
              </Text>
              <View style={{ flex: 1 }}>
                <Text variant="bodyStrong">{countryName(s.country, locale)}</Text>
                <Text variant="caption" color={colors.textMuted}>
                  {t('discover.end.passportCount', { count: s.compatibleCount })}
                </Text>
              </View>
              <Button
                label={t('discover.end.passportCta', { country: countryName(s.country, locale) })}
                size="sm"
                variant="outline"
                onPress={() => openCountry(s.country)}
                testID={`passport-suggestion-${s.country}`}
              />
            </View>
          ))}
          {capacity === 0 ? (
            <Text variant="caption" color={colors.textMuted}>
              {t('discover.end.passportLocked')}
            </Text>
          ) : null}
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  moon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md + 2 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  country: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.sm,
    borderRadius: radii.md,
    backgroundColor: 'rgba(255,255,255,0.75)',
  },
});
