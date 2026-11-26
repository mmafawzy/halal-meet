import { REGIONS, type FeedScope } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { useGuardians, useMe, usePassport, useRemovePassport, useVerifyIdentityDemo } from '@/api/hooks';
import { Button, Card, Icon, IconButton, Text } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { countryFlag, countryName, greetingKey } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

import { TopPicksRow } from './TopPicksRow';
import { NotificationBell } from '@/components/notifications/NotificationBell';

/** Everything pinned above the feed: greeting, scope, one banner slot, Top Picks and "new since". */
export function FeedHeader({ scope, newSince }: { scope: FeedScope | null; newSince: number }) {
  const t = useT();
  const me = useMe();
  const profile = me.data?.profile ?? null;
  const name = profile?.firstName ?? '';

  return (
    <View style={{ gap: spacing.lg, paddingBottom: spacing.lg }}>
      <View style={styles.greetRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="title" numberOfLines={1}>
            {t(`common.greeting.${greetingKey()}`, { name })}
          </Text>
          {profile ? (
            <Text variant="small" color={colors.textMuted} numberOfLines={1}>
              {t('discover.greeting.intention', { intention: t(`common.intentionShort.${profile.intention}`) })}
            </Text>
          ) : null}
        </View>
        <NotificationBell />
        <IconButton
          name="airplane-outline"
          accessibilityLabel={t('discover.header.passport')}
          bg={palette.white}
          onPress={() => router.push('/passport')}
        />
        <IconButton
          name="options-outline"
          accessibilityLabel={t('discover.header.preferences')}
          bg={palette.white}
          onPress={() => router.push('/settings/preferences')}
        />
      </View>

      {scope ? <ScopeBanner scope={scope} /> : null}
      <BannerSlot />
      <TopPicksRow />

      {newSince > 0 ? (
        <View style={styles.newSince}>
          <Icon name="sparkles-outline" size={16} color={colors.primary} />
          <Text variant="small" weight="semibold" color={colors.primary} style={{ flex: 1 }}>
            {newSince === 1 ? t('discover.newSince.lineOne') : t('discover.newSince.line', { count: newSince })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function ScopeBanner({ scope }: { scope: FeedScope }) {
  const t = useT();
  const locale = useLocale();
  const me = useMe();
  const home = me.data?.profile?.country ?? scope.countries[0] ?? '';

  if (scope.kind === 'passport') return <PassportScope scope={scope} />;
  if (scope.kind === 'region' && scope.region) {
    const region = REGIONS[scope.region][locale];
    return (
      <Card tone="muted" style={{ gap: 4 }}>
        <Text variant="small" weight="semibold">
          {t('discover.scope.region', { region })}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {t('discover.scope.regionBody', { region, country: countryName(home, locale) })}
        </Text>
      </Card>
    );
  }
  return (
    <Text variant="caption" color={colors.textSubtle}>
      {countryFlag(home)} {t('discover.scope.country', { country: countryName(home, locale) })}
    </Text>
  );
}

/** Rendered only while Passport is active (so the Passport query runs only then). */
function PassportScope({ scope }: { scope: FeedScope }) {
  const t = useT();
  const locale = useLocale();
  const passport = usePassport();
  const remove = useRemovePassport();
  const worldwide = passport.data?.destinations.some((d) => d.isWorldwide) ?? false;
  const place = worldwide
    ? t('discover.scope.worldwide')
    : scope.countries.map((c) => `${countryFlag(c)} ${countryName(c, locale)}`).join(' · ');

  const returnHome = async () => {
    const ids = passport.data?.destinations.map((d) => d.id) ?? [];
    for (const id of ids) await remove.mutateAsync(id);
  };

  return (
    <Card style={{ gap: spacing.sm, backgroundColor: '#EAF0F7', borderColor: '#D6E1EE' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Text variant="body" fontLocale="en">
          ✈️
        </Text>
        <Text variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>
          {t('discover.scope.passport', { place })}
        </Text>
      </View>
      <Text variant="caption" color={colors.textMuted}>
        {t('discover.scope.passportBody')}
      </Text>
      <Button
        label={t('discover.scope.returnHome')}
        variant="outline"
        size="sm"
        icon="home-outline"
        style={{ alignSelf: 'flex-start' }}
        loading={remove.isPending}
        disabled={!passport.data}
        onPress={() => void returnHome()}
        testID="passport-return-home"
      />
    </Card>
  );
}

/** Banner slot (max 1): verification nudge first, then guardian invite. Dismissible for the session. */
function BannerSlot() {
  const t = useT();
  const me = useMe();
  const guardians = useGuardians();
  const verify = useVerifyIdentityDemo();
  const showToast = useUi((s) => s.showToast);
  const [dismissed, setDismissed] = useState<Record<string, true>>({});

  const profile = me.data?.profile;
  if (!profile) return null;
  const needsVerify = !profile.verifications.includes('identity') && !dismissed.verify;
  const needsGuardian = guardians.isSuccess && guardians.data.length === 0 && !dismissed.guardian;
  const kind = needsVerify ? 'verify' : needsGuardian ? 'guardian' : null;
  if (!kind) return null;

  const onCta = () => {
    if (kind === 'guardian') {
      router.push('/(tabs)/family');
      return;
    }
    if (api.dev) {
      verify.mutate(undefined, { onSuccess: () => showToast({ message: t('discover.banner.verified'), tone: 'success' }) });
    } else {
      router.push('/(tabs)/profile');
    }
  };

  return (
    <View style={styles.banner} testID={`banner-${kind}`}>
      <View style={styles.bannerIcon}>
        <Icon name={kind === 'verify' ? 'shield-checkmark-outline' : 'people-outline'} size={18} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="small" weight="semibold">
          {t(kind === 'verify' ? 'discover.banner.verifyTitle' : 'discover.banner.guardianTitle')}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {t(kind === 'verify' ? 'discover.banner.verifyBody' : 'discover.banner.guardianBody')}
        </Text>
        <Button
          label={t(kind === 'verify' ? 'discover.banner.verifyCta' : 'discover.banner.guardianCta')}
          variant="secondary"
          size="sm"
          loading={verify.isPending}
          style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
          onPress={onCta}
          testID={`banner-${kind}-cta`}
        />
      </View>
      <IconButton
        name="close"
        size={30}
        accessibilityLabel={t('discover.banner.dismiss')}
        onPress={() => setDismissed((d) => ({ ...d, [kind]: true }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  greetRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  newSince: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.pill,
    backgroundColor: colors.primaryTint,
    alignSelf: 'flex-start',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.xl,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
  bannerIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
});
