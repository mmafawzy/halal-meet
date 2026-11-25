import type { Gender, Locale, PassportDestination } from '@halal-meet/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { PassportBadge } from '@/components/profile/Badges';
import { Icon, Tag, Text } from '@/components/ui';
import { useLocale, useT, type TFunction } from '@/i18n';
import { cityLabel } from '@/lib/cities';
import { countryFlag, countryName, formatDate } from '@/lib/format';
import { colors, palette, spacing } from '@/theme';

/** "Dubai, UAE" / "UAE" / "Worldwide". */
export function destinationLabel(d: Pick<PassportDestination, 'country' | 'city' | 'isWorldwide'>, locale: Locale, t: TFunction): string {
  if (d.isWorldwide) return t('passport.destinations.worldwide');
  const country = countryName(d.country, locale);
  if (!d.city) return country;
  return `${cityLabel(d.country, d.city, locale)}${locale === 'ar' ? '، ' : ', '}${country}`;
}

/** One active / scheduled Passport destination, with the honest card preview people there will see. */
export function DestinationRow({
  destination: d,
  home,
  gender,
  onRemove,
  removing,
}: {
  destination: PassportDestination;
  home: { country: string; city: string } | null;
  gender: Gender;
  onRemove: () => void;
  removing?: boolean;
}) {
  const t = useT();
  const locale = useLocale();
  const label = destinationLabel(d, locale, t);
  const scheduled = d.status === 'scheduled';

  const when =
    d.visitFrom && d.visitTo
      ? t('passport.destinations.dates', { from: formatDate(d.visitFrom, locale), to: formatDate(d.visitTo, locale) })
      : d.activeUntil
        ? t('passport.destinations.until', { date: formatDate(d.activeUntil, locale) })
        : null;

  return (
    <View style={styles.row} testID={`passport-destination-${d.id}`}>
      <View style={styles.head}>
        <Text style={{ fontSize: 24, lineHeight: 30 }}>{d.isWorldwide ? '🌍' : countryFlag(d.country)}</Text>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="bodyStrong">{label}</Text>
          <Text variant="caption" color={colors.textMuted}>
            {t(`common.purpose.${d.purpose}`)}
            {when ? ` · ${when}` : ''}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('passport.destinations.removeLabel', { place: label })}
          disabled={removing}
          onPress={onRemove}
          hitSlop={8}
          style={({ pressed }) => [styles.remove, pressed && { backgroundColor: palette.sand200 }, removing && { opacity: 0.5 }]}
          testID={`passport-remove-${d.id}`}
        >
          <Icon name="close" size={16} color={colors.textMuted} />
          <Text variant="caption" color={colors.textMuted}>
            {t('passport.destinations.remove')}
          </Text>
        </Pressable>
      </View>
      <Tag
        label={scheduled ? t('passport.destinations.status.scheduled', { date: formatDate(d.visibleFrom, locale) }) : t('passport.destinations.status.active')}
        tone={scheduled ? 'amber' : 'primary'}
        icon={scheduled ? 'time-outline' : 'checkmark-circle'}
        style={{ alignSelf: 'flex-start' }}
      />
      {home && !d.isWorldwide ? (
        <View style={{ gap: spacing.xs }}>
          <Text variant="overline" color={colors.textSubtle}>
            {t('passport.destinations.preview')}
          </Text>
          <PassportBadge
            gender={gender}
            passport={{
              homeCountry: home.country,
              homeCity: home.city,
              destinationCountry: d.country,
              purpose: d.purpose,
              visitFrom: d.visitFrom,
              visitTo: d.visitTo,
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: spacing.sm, padding: spacing.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: 999, backgroundColor: palette.sand100 },
});
