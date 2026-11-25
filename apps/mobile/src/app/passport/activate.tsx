import type { PassportPurpose } from '@halal-meet/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAddPassport, useMe, usePassport } from '@/api/hooks';
import { ApiError, isLimitReached } from '@/api/types';
import { CountrySheet } from '@/components/onboarding/CountrySheet';
import { DateInput } from '@/components/passport/DateInput';
import {
  LOW_COUNT_WARNING,
  PASS_MAX_TRIP_DAYS,
  daysBetween,
  isValidIsoDate,
  todayIso,
  visibleFromIso,
} from '@/components/passport/dates';
import { destinationLabel } from '@/components/passport/DestinationRow';
import { PassportPurchaseSheet } from '@/components/passport/PassportOffers';
import { VerifyIdentityCard } from '@/components/passport/VerifyIdentityCard';
import { PassportBadge } from '@/components/profile/Badges';
import {
  Button,
  Chip,
  ChipRow,
  ErrorState,
  Field,
  Header,
  Icon,
  LoadingState,
  OptionCard,
  Screen,
  Text,
  TextField,
  type IconName,
} from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { CITIES } from '@/lib/cities';
import { countryFlag, countryName, formatDate } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

const PURPOSES: Array<{ value: PassportPurpose; icon: IconName }> = [
  { value: 'relocate', icon: 'home-outline' },
  { value: 'moving', icon: 'cube-outline' },
  { value: 'visiting', icon: 'calendar-outline' },
  { value: 'spouse_relocates_to_me', icon: 'swap-horizontal' },
  { value: 'either', icon: 'globe-outline' },
];

function isPurpose(v: unknown): v is PassportPurpose {
  return PURPOSES.some((p) => p.value === v);
}

/**
 * Screens 72 / 73 — Passport activation & Travel mode. Destination (country + optional city), the
 * required "Why are you exploring here?" purpose (shown on the card), optional / required dates,
 * the honest card preview, identity verification, and the purchase sheet when not yet entitled.
 * Params: `?country=AE` (from a suggestion), `?purpose=visiting` (from "Plan a trip").
 */
export default function PassportActivateScreen() {
  const t = useT();
  const locale = useLocale();
  const params = useLocalSearchParams<{ country?: string; purpose?: string }>();
  const me = useMe();
  const passport = usePassport();
  const add = useAddPassport();
  const showToast = useUi((s) => s.showToast);

  const [country, setCountry] = useState<string | null>(typeof params.country === 'string' && params.country ? params.country : null);
  const [city, setCity] = useState('');
  const [purpose, setPurpose] = useState<PassportPurpose | null>(isPurpose(params.purpose) ? params.purpose : null);
  const [visitFrom, setVisitFrom] = useState('');
  const [visitTo, setVisitTo] = useState('');
  const [countryOpen, setCountryOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);
  const [attempted, setAttempted] = useState(false);

  const header = <Header title={t('passport.activate.title')} />;

  if (passport.isLoading || me.isLoading) {
    return (
      <Screen header={header}>
        <LoadingState />
      </Screen>
    );
  }
  if (passport.isError || !passport.data) {
    return (
      <Screen header={header}>
        <ErrorState onRetry={() => void passport.refetch()} />
      </Screen>
    );
  }

  const profile = me.data?.profile ?? null;
  const home = profile ? { country: profile.country, city: profile.city } : null;
  const verified = !!profile?.verifications.includes('identity');
  const { destinations, entitlements: ent, suggestions } = passport.data;

  const isHome = !!country && country === home?.country;
  const place = country ? destinationLabel({ country, city: city.trim() || null, isWorldwide: false }, locale, t) : '';
  const count = country ? (suggestions.find((s) => s.country === country)?.compatibleCount ?? null) : null;
  const cities = country ? (CITIES[country] ?? []) : [];

  // ── dates ──
  const today = todayIso();
  const needsTrip = purpose === 'visiting';
  const allowsMoveDate = purpose === 'moving';
  const dateError = (v: string): string | null => {
    if (!v) return null;
    if (!isValidIsoDate(v)) return t('passport.activate.dates.invalid');
    if (v < today) return t('passport.activate.dates.past');
    return null;
  };
  const fromErr = needsTrip || allowsMoveDate ? dateError(visitFrom) : null;
  let toErr = needsTrip ? dateError(visitTo) : null;
  if (needsTrip && !toErr && !fromErr && visitFrom && visitTo && visitTo < visitFrom) toErr = t('passport.activate.dates.order');
  if (needsTrip && !toErr && !fromErr && visitFrom && visitTo && ent.source === 'pass' && daysBetween(visitFrom, visitTo) > PASS_MAX_TRIP_DAYS) {
    toErr = t('passport.activate.dates.tooLong');
  }
  const missingTrip = needsTrip && (!visitFrom || !visitTo);
  const datesOk = !fromErr && !toErr && !missingTrip;
  const visibleFrom = needsTrip && visitFrom && !fromErr ? visibleFromIso(visitFrom) : null;
  const scheduled = !!visibleFrom && visibleFrom > today;

  // ── capacity ──
  const replaces = ent.capacity === 1 && destinations.length >= 1 ? destinations[0]! : null;
  const full = ent.capacity > 1 && destinations.length >= ent.capacity;
  const entitled = ent.capacity > 0;

  const formOk = !!country && !isHome && !!purpose && datesOk;
  const canSubmit = formOk && verified && !full;

  const body = () => ({
    country: country!,
    city: city.trim() || null,
    purpose: purpose!,
    visitFrom: (needsTrip || allowsMoveDate) && visitFrom ? visitFrom : null,
    visitTo: needsTrip && visitTo ? visitTo : null,
  });

  const activate = () => {
    add.mutate(body(), {
      onSuccess: () => {
        showToast({
          message: scheduled
            ? t('passport.activate.scheduled', { place, date: formatDate(visibleFrom, locale) })
            : t('passport.activate.done', { place }),
          tone: 'success',
          durationMs: 3200,
        });
        if (router.canGoBack()) router.back();
        else router.replace('/passport');
      },
      onError: (e) => {
        if (isLimitReached(e)) {
          setBuyOpen(true);
          return;
        }
        if (e instanceof ApiError && e.code === 'identity_required') {
          showToast({ message: t('passport.activate.identityRequired'), tone: 'danger' });
          return;
        }
        if (e instanceof ApiError && e.status === 409) {
          showToast({ message: t('passport.activate.full', { capacity: ent.capacity }), tone: 'danger' });
          return;
        }
        showToast({ message: t('passport.activate.failed'), tone: 'danger' });
      },
    });
  };

  const submit = () => {
    setAttempted(true);
    if (!canSubmit) return;
    if (!entitled) setBuyOpen(true);
    else activate();
  };

  const ctaLabel = !entitled
    ? t('passport.activate.choosePlan')
    : scheduled
      ? t('passport.activate.scheduleSubmit')
      : t('passport.activate.submit');

  return (
    <Screen
      header={header}
      keyboard
      contentStyle={{ gap: spacing.xl }}
      testID="passport-activate"
      footer={
        <Button
          label={ctaLabel}
          size="lg"
          variant={entitled ? 'primary' : 'gold'}
          icon="airplane"
          fullWidth
          loading={add.isPending}
          disabled={full || (attempted && !canSubmit)}
          onPress={submit}
          testID="passport-activate-submit"
        />
      }
    >
      {/* Destination */}
      <Field
        label={t('passport.activate.destination')}
        error={attempted && !country ? t('passport.activate.chooseCountry') : isHome ? t('passport.activate.homeCountry') : null}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('passport.activate.chooseCountry')}
          onPress={() => setCountryOpen(true)}
          style={({ pressed }) => [styles.picker, pressed && { backgroundColor: palette.sand100 }]}
          testID="passport-country"
        >
          <Text style={{ fontSize: 20, lineHeight: 26 }}>{country ? countryFlag(country) : '🌍'}</Text>
          <Text variant="body" weight={country ? 'medium' : 'regular'} color={country ? colors.text : colors.textSubtle} style={{ flex: 1 }}>
            {country ? countryName(country, locale) : t('passport.activate.chooseCountry')}
          </Text>
          <Icon name="chevron-down" size={16} color={colors.textMuted} />
        </Pressable>
      </Field>

      {country && !isHome ? (
        <Field label={t('passport.activate.city')} hint={t('passport.activate.cityHint')}>
          <View style={{ gap: spacing.sm }}>
            <TextField
              value={city}
              onChangeText={setCity}
              placeholder={t('passport.activate.cityPlaceholder')}
              accessibilityLabel={t('passport.activate.city')}
              testID="passport-city"
            />
            {cities.length > 0 ? (
              <ChipRow>
                {cities.map((c) => (
                  <Chip
                    key={c.en}
                    size="sm"
                    label={locale === 'ar' ? c.ar : c.en}
                    selected={city === c.en}
                    onPress={() => setCity((cur) => (cur === c.en ? '' : c.en))}
                  />
                ))}
              </ChipRow>
            ) : null}
          </View>
        </Field>
      ) : null}

      {country && !isHome ? (
        <View style={{ gap: spacing.sm }}>
          <View style={[styles.banner, { backgroundColor: colors.primaryTint }]}>
            <Icon name="people-outline" size={18} color={colors.primary} />
            <Text variant="small" weight="medium" style={{ flex: 1 }}>
              {count !== null
                ? t('passport.activate.count', { count, place: countryName(country, locale) })
                : t('passport.activate.countUnknown', { place: countryName(country, locale) })}
            </Text>
          </View>
          {count !== null && count < LOW_COUNT_WARNING ? (
            <View style={[styles.banner, { backgroundColor: colors.discussSoft }]}>
              <Icon name="information-circle-outline" size={18} color="#9A5E12" />
              <Text variant="small" color="#9A5E12" style={{ flex: 1 }}>
                {t('passport.activate.lowCount', { count })}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Purpose — required, shown on the card */}
      <Field
        label={t('passport.activate.purpose')}
        hint={t('passport.activate.purposeHint')}
        error={attempted && !purpose ? t('passport.activate.purposeRequired') : null}
      >
        <View style={{ gap: spacing.sm }}>
          {PURPOSES.map((p) => (
            <OptionCard
              key={p.value}
              icon={p.icon}
              title={t(`common.purpose.${p.value}`)}
              description={t(`passport.activate.purposeDesc.${p.value}`)}
              selected={purpose === p.value}
              onPress={() => setPurpose(p.value)}
            />
          ))}
        </View>
      </Field>

      {/* Travel mode dates */}
      {needsTrip ? (
        <View style={{ gap: spacing.md }}>
          <Text variant="subheading">{t('passport.activate.dates.title')}</Text>
          <DateInput
            label={t('passport.activate.dates.from')}
            value={visitFrom}
            onChange={setVisitFrom}
            error={fromErr ?? (attempted && !visitFrom ? t('passport.activate.dates.required') : null)}
            testID="passport-visit-from"
          />
          <DateInput
            label={t('passport.activate.dates.to')}
            value={visitTo}
            onChange={setVisitTo}
            error={toErr ?? (attempted && !visitTo ? t('passport.activate.dates.required') : null)}
            testID="passport-visit-to"
          />
          {visibleFrom ? (
            <View style={[styles.banner, { backgroundColor: colors.bgMuted }]}>
              <Icon name="eye-outline" size={18} color={colors.textMuted} />
              <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                {scheduled
                  ? t('passport.activate.dates.visibleFrom', { date: formatDate(visibleFrom, locale, { day: 'numeric', month: 'long' }) })
                  : t('passport.activate.dates.visibleNow')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
      {allowsMoveDate ? (
        <DateInput label={t('passport.activate.dates.moveTitle')} value={visitFrom} onChange={setVisitFrom} error={fromErr} testID="passport-move-date" />
      ) : null}

      {/* Honest preview */}
      {home && country && !isHome && purpose ? (
        <View style={{ gap: spacing.sm }}>
          <Text variant="overline" color={colors.textMuted}>
            {t('passport.activate.preview')}
          </Text>
          <PassportBadge
            gender={profile?.gender ?? 'male'}
            passport={{
              homeCountry: home.country,
              homeCity: home.city,
              destinationCountry: country,
              purpose,
              visitFrom: (needsTrip || allowsMoveDate) && isValidIsoDate(visitFrom) ? visitFrom : null,
              visitTo: needsTrip && isValidIsoDate(visitTo) ? visitTo : null,
            }}
          />
          <Text variant="caption" color={colors.textMuted}>
            {t('passport.home.honest')}
          </Text>
        </View>
      ) : null}

      {replaces ? (
        <Text variant="small" color={colors.textMuted}>
          {t('passport.activate.replaces', { place: destinationLabel(replaces, locale, t) })}
        </Text>
      ) : null}
      {full ? (
        <Text variant="small" color={colors.danger}>
          {t('passport.activate.full', { capacity: ent.capacity })}
        </Text>
      ) : null}

      {!verified ? <VerifyIdentityCard /> : null}
      {attempted && !verified ? (
        <Text variant="small" color={colors.danger}>
          {t('passport.activate.identityRequired')}
        </Text>
      ) : null}

      <CountrySheet
        visible={countryOpen}
        onClose={() => setCountryOpen(false)}
        value={country}
        onSelect={(code) => {
          setCountry(code);
          if (city && !(CITIES[code] ?? []).some((c) => c.en === city)) setCity('');
        }}
        title={t('passport.activate.chooseCountry')}
      />
      <PassportPurchaseSheet
        visible={buyOpen}
        onClose={() => setBuyOpen(false)}
        count={country && !isHome ? count : null}
        place={country && !isHome ? countryName(country, locale) : null}
        onPurchased={() => {
          if (canSubmit) activate();
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 50,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bgElevated,
  },
  banner: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.md, borderRadius: radii.md },
});
