import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useAddPassport, useMe, usePassport, useRemovePassport } from '@/api/hooks';
import { DestinationRow, destinationLabel } from '@/components/passport/DestinationRow';
import { PassportPurchaseSheet } from '@/components/passport/PassportOffers';
import { VerifyIdentityCard } from '@/components/passport/VerifyIdentityCard';
import {
  Button,
  Card,
  ErrorState,
  Header,
  Icon,
  IconButton,
  ListRow,
  LoadingState,
  RowGroup,
  Screen,
  SectionTitle,
  Sheet,
  Tag,
  Text,
} from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { cityLabel } from '@/lib/cities';
import { countryFlag, countryName, formatDate } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

/**
 * Screen 71 — Passport hub: home city (always transparent), entitlement / capacity, current
 * destinations with the honest badge preview, live compatible-count suggestions, Worldwide mode and
 * Travel mode.
 */
export default function PassportHubScreen() {
  const t = useT();
  const locale = useLocale();
  const me = useMe();
  const passport = usePassport();
  const remove = useRemovePassport();
  const add = useAddPassport();
  const showToast = useUi((s) => s.showToast);

  const [helpOpen, setHelpOpen] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  const header = (
    <Header
      title={t('passport.title')}
      right={<IconButton name="help-circle-outline" accessibilityLabel={t('passport.help.title')} onPress={() => setHelpOpen(true)} />}
    />
  );

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
  const limits = me.data?.entitlements.limits;
  const verified = !!profile?.verifications.includes('identity');
  const { destinations, entitlements: ent, suggestions } = passport.data;
  const home = profile ? { country: profile.country, city: profile.city } : null;
  const homeLabel = home ? `${cityLabel(home.country, home.city, locale)}${locale === 'ar' ? '، ' : ', '}${countryName(home.country, locale)}` : '';
  const hasWorldwide = destinations.some((d) => d.isWorldwide);
  const worldwideAllowed = !!limits?.passport.worldwide;
  const full = ent.capacity > 1 && destinations.length >= ent.capacity;
  const browsing = destinations.filter((d) => d.status === 'active');

  const sourceLabel =
    ent.source === 'pass'
      ? t('passport.capacity.source.pass', { date: formatDate(ent.passExpiresAt, locale, { day: 'numeric', month: 'short' }) })
      : t(`passport.capacity.source.${ent.source}`);

  const goActivate = (params: { country?: string; purpose?: string } = {}) =>
    router.push({ pathname: '/passport/activate', params });

  const onRemove = (id: string, label: string) => {
    const last = destinations.length === 1;
    remove.mutate(id, {
      onSuccess: () =>
        showToast({
          message: last ? t('passport.destinations.removedHome', { place: label }) : t('passport.destinations.removed', { place: label }),
          tone: 'neutral',
        }),
      onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
    });
  };

  const turnOnWorldwide = () => {
    if (!home) return;
    add.mutate(
      { country: home.country, isWorldwide: true, purpose: 'either' },
      {
        onSuccess: () => showToast({ message: t('passport.worldwide.on'), tone: 'success' }),
        onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
      },
    );
  };

  return (
    <Screen header={header} pattern contentStyle={{ gap: spacing.lg }} testID="passport-hub">
      <Text variant="small" color={colors.textMuted}>
        {t('passport.subtitle')}
      </Text>

      {/* Home — always transparent (honesty rule). */}
      <Card style={{ gap: spacing.sm }}>
        <Text variant="overline" color={colors.textMuted}>
          {t('passport.home.label')}
        </Text>
        {browsing.length > 0 ? (
          <Text variant="subheading">
            ✈️ {t('passport.home.browsing', { place: browsing.map((d) => destinationLabel(d, locale, t)).join(' · ') })}
          </Text>
        ) : null}
        {home ? (
          <Text variant={browsing.length > 0 ? 'body' : 'subheading'} color={browsing.length > 0 ? colors.textMuted : colors.text}>
            {countryFlag(home.country)} {t('passport.home.current', { place: homeLabel })}
          </Text>
        ) : null}
        <View style={styles.note}>
          <Icon name="home-outline" size={16} color={colors.primary} />
          <Text variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
            {t('passport.home.honest')}
          </Text>
        </View>
      </Card>

      {/* Entitlement / capacity */}
      {ent.capacity > 0 ? (
        <Card tone="muted" style={{ gap: spacing.xs }} accessibilityLabel={t('passport.capacity.used', { used: destinations.length, capacity: ent.capacity })}>
          <View style={styles.between}>
            <Text variant="bodyStrong">{t('passport.capacity.used', { used: destinations.length, capacity: ent.capacity })}</Text>
            <Tag label={sourceLabel} tone={ent.source === 'plan' ? 'gold' : 'primary'} />
          </View>
          {ent.capacity === 1 ? (
            <Text variant="caption" color={colors.textMuted}>
              {t('passport.purchase.addon.body')}
            </Text>
          ) : null}
        </Card>
      ) : (
        <Card tone="premium" style={{ gap: spacing.sm }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <Text style={{ fontSize: 20, lineHeight: 26 }}>✈️</Text>
            <Text variant="bodyStrong" style={{ flex: 1 }}>
              {t('passport.capacity.noneTitle')}
            </Text>
          </View>
          <Text variant="small" color={colors.textMuted}>
            {t('passport.capacity.noneBody')}
          </Text>
          {ent.freePassAvailable ? (
            <Text variant="small" weight="semibold" color={colors.primary}>
              {t('passport.capacity.freePass')}
            </Text>
          ) : null}
          <Button label={t('passport.capacity.options')} variant="gold" icon="airplane" onPress={() => setBuyOpen(true)} testID="passport-options" />
        </Card>
      )}

      {!verified ? <VerifyIdentityCard /> : null}

      {/* Current destinations */}
      {destinations.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('passport.destinations.title')} />
          <View style={styles.group}>
            {destinations.map((d, i) => (
              <View key={d.id} style={i > 0 ? styles.sep : null}>
                <DestinationRow
                  destination={d}
                  home={home}
                  gender={profile?.gender ?? 'male'}
                  removing={remove.isPending}
                  onRemove={() => onRemove(d.id, destinationLabel(d, locale, t))}
                />
              </View>
            ))}
          </View>
          {full ? (
            <Text variant="caption" color={colors.textMuted}>
              {t('passport.activate.full', { capacity: ent.capacity })}
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Search → activation */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('passport.search')}
        onPress={() => goActivate()}
        style={({ pressed }) => [styles.search, pressed && { backgroundColor: palette.sand100 }]}
        testID="passport-search"
      >
        <Icon name="search" size={18} color={colors.textMuted} />
        <Text variant="body" color={colors.textSubtle} style={{ flex: 1 }}>
          {t('passport.search')}
        </Text>
      </Pressable>

      {/* Suggestions with live, honest counts */}
      <View style={{ gap: spacing.sm }}>
        <SectionTitle title={t('passport.suggestions.title')} />
        {suggestions.length === 0 ? (
          <Text variant="small" color={colors.textMuted}>
            {t('passport.suggestions.empty')}
          </Text>
        ) : (
          <View style={styles.group}>
            {suggestions.map((s, i) => (
              <Pressable
                key={s.country}
                accessibilityRole="button"
                accessibilityLabel={t('passport.suggestions.open', { place: countryName(s.country, locale) })}
                onPress={() => goActivate({ country: s.country })}
                style={({ pressed }) => [styles.suggestion, i > 0 && styles.sep, pressed && { backgroundColor: palette.sand100 }]}
                testID={`passport-suggestion-${s.country}`}
              >
                <Text style={{ fontSize: 22, lineHeight: 28 }}>{countryFlag(s.country)}</Text>
                <Text variant="body" weight="medium" style={{ flex: 1 }}>
                  {countryName(s.country, locale)}
                </Text>
                <Text variant="small" color={colors.primary} weight="semibold">
                  {t('passport.suggestions.count', { count: s.compatibleCount })}
                </Text>
                <Icon name="chevron-forward" size={18} color={colors.textSubtle} directional />
              </Pressable>
            ))}
          </View>
        )}
        <Text variant="caption" color={colors.textSubtle}>
          {t('passport.suggestions.honest')}
        </Text>
      </View>

      <RowGroup>
        <ListRow
          icon="globe-outline"
          label={t('passport.worldwide.title')}
          description={t('passport.worldwide.body')}
          onPress={worldwideAllowed ? undefined : () => router.push({ pathname: '/paywall', params: { trigger: 'passport' } })}
          right={
            !worldwideAllowed ? (
              <Tag label={t('passport.worldwide.gold')} tone="gold" icon="lock-closed" />
            ) : hasWorldwide ? (
              <Tag label={t('passport.destinations.status.active')} tone="primary" icon="checkmark-circle" />
            ) : (
              <Button
                label={t('passport.worldwide.turnOn')}
                size="sm"
                variant="secondary"
                loading={add.isPending}
                disabled={!verified || full}
                onPress={turnOnWorldwide}
              />
            )
          }
        />
        <ListRow
          icon="calendar-outline"
          label={t('passport.travel.title')}
          description={t('passport.travel.body')}
          onPress={() => goActivate({ purpose: 'visiting' })}
        />
      </RowGroup>

      <Text variant="caption" color={colors.textMuted} style={{ marginBottom: spacing.xl }}>
        {t('passport.afterExpiry')}
      </Text>

      <Sheet
        visible={helpOpen}
        onClose={() => setHelpOpen(false)}
        title={t('passport.help.title')}
        footer={<Button label={t('common.actions.gotIt')} fullWidth onPress={() => setHelpOpen(false)} />}
      >
        {(['b1', 'b2', 'b3', 'b4'] as const).map((k) => (
          <View key={k} style={styles.note}>
            <Icon name="checkmark" size={16} color={colors.primary} />
            <Text variant="body" color={colors.textMuted} style={{ flex: 1 }}>
              {t(`passport.help.${k}`)}
            </Text>
          </View>
        ))}
      </Sheet>

      <PassportPurchaseSheet visible={buyOpen} onClose={() => setBuyOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  note: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm, flexWrap: 'wrap' },
  group: { backgroundColor: colors.card, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  search: {
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
  suggestion: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.md, minHeight: 52 },
});
