import type { HalalMode, PassportBadge as PassportBadgeData, ProfileCard, VerificationKind } from '@halal-meet/core';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useLocale, useT, useTs } from '../../i18n';
import { cityLabel } from '../../lib/cities';
import { countryFlag, countryName, formatDate } from '../../lib/format';
import { colors, palette, radii, spacing } from '../../theme';
import { Icon, type IconName } from '../ui/Icon';
import { Text } from '../ui/Text';

const VERIFICATION_STYLE: Record<VerificationKind, { icon: IconName; color: string }> = {
  phone: { icon: 'call', color: palette.emerald600 },
  identity: { icon: 'shield-checkmark', color: palette.blue600 },
  profession: { icon: 'briefcase', color: palette.purple600 },
  education: { icon: 'school', color: '#B08A1E' },
  marital: { icon: 'document-text', color: palette.amber500 },
  family: { icon: 'people', color: palette.emerald600 },
};

/** Compact verification badges ("✓ID ✓Family"). Phone is implied for everyone so hidden unless alone. */
export function VerificationBadges({ kinds, compact = true, style }: { kinds: VerificationKind[]; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const t = useT();
  const shown = kinds.filter((k) => k !== 'phone');
  const list: VerificationKind[] = shown.length ? shown : kinds.slice(0, 1);
  return (
    <View style={[styles.row, style]}>
      {list.map((k) => {
        const s = VERIFICATION_STYLE[k];
        return (
          <View key={k} style={styles.badge} accessibilityLabel={t(`common.verification.${k}`)}>
            <Icon name={s.icon} size={12} color={s.color} />
            <Text variant="caption" color={colors.textMuted}>
              {compact ? t(`common.verificationShort.${k}`) : t(`common.verification.${k}`)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const MODE_ICON: Record<HalalMode, IconName> = { private: 'person', guided: 'compass', wali: 'people' };

export function HalalModeBadge({ mode, style }: { mode: HalalMode; style?: StyleProp<ViewStyle> }) {
  const t = useT();
  return (
    <View style={[styles.mode, style]} accessibilityLabel={t(`common.halalMode.${mode}`)}>
      <Icon name={MODE_ICON[mode]} size={12} color={colors.primary} />
      <Text variant="caption" color={colors.primary}>
        {t(`common.halalModeShort.${mode}`)}
      </Text>
    </View>
  );
}

export function PlanBadge({ tier, style }: { tier: 'free' | 'plus' | 'gold' | 'elite'; style?: StyleProp<ViewStyle> }) {
  const t = useT();
  const premium = tier !== 'free';
  return (
    <View style={[styles.plan, premium ? { backgroundColor: palette.gold500 } : { backgroundColor: palette.sand200 }, style]}>
      {premium ? <Icon name="sparkles" size={11} color={palette.navy900} /> : null}
      <Text variant="caption" color={palette.navy900}>
        {t(`common.plan.${tier}`)}
      </Text>
    </View>
  );
}

/** Human sentence for a Passport badge: "Lives in London · Moving to Dubai in 2027". */
export function usePassportText() {
  const ts = useTs();
  const locale = useLocale();
  return (p: PassportBadgeData, subject: ProfileCard['gender']): string => {
    const home = `${cityLabel(p.homeCountry, p.homeCity, locale)}`;
    const dest = countryName(p.destinationCountry, locale);
    if (p.purpose === 'visiting' && p.visitFrom && p.visitTo) {
      return ts('common.passportBadge.visitingDates', subject, {
        home,
        dest,
        from: formatDate(p.visitFrom, locale),
        to: formatDate(p.visitTo, locale),
      });
    }
    if (p.purpose === 'moving' && p.visitFrom) {
      return ts('common.passportBadge.movingDate', subject, { home, dest, date: formatDate(p.visitFrom, locale, { month: 'short', year: 'numeric' }) });
    }
    return ts(`common.passportBadge.${p.purpose}`, subject, { home, dest });
  };
}

/** ✈️ Passport badge — always shows the real home city + purpose (honesty rule). */
export function PassportBadge({ passport, gender, style }: { passport: PassportBadgeData; gender: ProfileCard['gender']; style?: StyleProp<ViewStyle> }) {
  const text = usePassportText()(passport, gender);
  return (
    <View style={[styles.passport, style]}>
      <Text variant="caption" fontLocale="en">
        ✈️
      </Text>
      <Text variant="caption" color={palette.navy700} style={{ flexShrink: 1 }}>
        {countryFlag(passport.homeCountry)} {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  mode: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.primaryTint,
    borderRadius: radii.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    alignSelf: 'flex-start',
  },
  plan: { flexDirection: 'row', alignItems: 'center', gap: 3, borderRadius: radii.pill, paddingHorizontal: spacing.sm, paddingVertical: 2, alignSelf: 'flex-start' },
  passport: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#EAF0F7',
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
});
