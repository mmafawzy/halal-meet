import type { Dimension, Importance, MaritalStatus, MatchPreferencesInput } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useQueryClient } from '@tanstack/react-query';

import { useMe, usePutPreferences } from '@/api/hooks';
import { Stepper } from '@/components/me/Stepper';
import { defaultPreferences } from '@/components/onboarding/draft';
import { InlineNote } from '@/components/onboarding/OnboardingFrame';
import { privacyKeys, useMyPreferences } from '@/components/privacy/usePrivacy';
import { IMPORTANCE_ORDER } from '@/components/questions/QuestionEditor';
import {
  Button,
  Card,
  Chip,
  ChipRow,
  ErrorState,
  Field,
  Header,
  Icon,
  LoadingState,
  Screen,
  SectionTitle,
  Text,
  ToggleRow,
} from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { LANGUAGES, languageLabel } from '@/lib/cities';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, radii, spacing } from '@/theme';

const MARITAL: MaritalStatus[] = ['never_married', 'divorced', 'widowed', 'annulled'];
const DIMENSIONS: Dimension[] = ['religion', 'family', 'children', 'lifestyle', 'finance', 'career', 'timeline', 'location', 'language'];
const AGE_MIN = 18;
const AGE_MAX = 80;

/**
 * Match preferences (screen 28): loaded with GET /me/preferences (saved values or the server defaults) and
 * saved with PUT /me/preferences. The session cache is only a fallback if the read fails.
 */
export default function PreferencesScreen() {
  const t = useT();
  const me = useMe();
  const saved = useMyPreferences();
  const cached = useSession((s) => s.preferences);

  const header = <Header title={t('me.prefs.title')} />;
  if (me.isLoading || saved.isLoading) return <Screen header={header}><LoadingState /></Screen>;
  if (me.isError || !me.data) return <Screen header={header}><ErrorState onRetry={() => void me.refetch()} /></Screen>;

  const p = me.data.profile;
  const fromServer = saved.data;
  const initial = fromServer?.preferences ?? cached ?? defaultPreferences(p?.gender ?? 'male', p?.age ?? 28);
  const isDefault = fromServer ? !fromServer.saved : !cached;
  return <PreferencesForm initial={initial} isDefault={isDefault} advanced={me.data.entitlements.limits.advancedFilters} />;
}

function PreferencesForm({ initial, isDefault, advanced }: { initial: MatchPreferencesInput; isDefault: boolean; advanced: boolean }) {
  const t = useT();
  const locale = useLocale();
  const put = usePutPreferences();
  const qc = useQueryClient();
  const [prefs, setPrefs] = useState<MatchPreferencesInput>(initial);

  const set = <K extends keyof MatchPreferencesInput>(k: K, v: MatchPreferencesInput[K]) => setPrefs((p) => ({ ...p, [k]: v }));

  const toggleMarital = (m: MaritalStatus) => {
    const cur = prefs.maritalStatuses ?? [];
    const next = cur.includes(m) ? cur.filter((x) => x !== m) : [...cur, m];
    // Selecting every status is the same as "any".
    set('maritalStatuses', next.length === 0 || next.length === MARITAL.length ? null : MARITAL.filter((x) => next.includes(x)));
  };

  const toggleLanguage = (code: string) => {
    const cur = prefs.languages ?? [];
    const next = cur.includes(code) ? cur.filter((x) => x !== code) : [...cur, code];
    set('languages', next.length ? next : null);
  };

  const setImportance = (d: Dimension, v: Importance) =>
    setPrefs((p) => {
      const dims = { ...p.dimensionImportance };
      if (v === 'important') delete dims[d]; // missing = important (engine default)
      else dims[d] = v;
      return { ...p, dimensionImportance: dims };
    });

  const hasDealbreaker = Object.values(prefs.dimensionImportance).includes('dealbreaker');

  const submit = () =>
    put.mutate(prefs, {
      onSuccess: () => {
        qc.setQueryData(privacyKeys.preferences, { saved: true, preferences: prefs });
        useUi.getState().showToast({ message: t('me.prefs.saved'), tone: 'success', durationMs: 2200 });
        if (router.canGoBack()) router.back();
      },
      onError: () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' }),
    });

  const openPaywall = () => router.push('/paywall');

  return (
    <Screen
      header={<Header title={t('me.prefs.title')} />}
      footer={<Button label={t('me.prefs.save')} size="lg" fullWidth loading={put.isPending} onPress={submit} testID="prefs-save" />}
      testID="prefs-screen"
    >
      <View style={{ gap: spacing.xl }}>
        <Text variant="small" color={colors.textMuted}>
          {t('me.prefs.subtitle')}
        </Text>
        {isDefault ? <InlineNote tone="primary" text={t('me.prefs.defaults')} /> : <InlineNote text={t('me.summary.cached')} />}

        <Field label={t('me.prefs.age')}>
          <Text variant="caption" color={colors.textMuted}>
            {t('me.prefs.ageValue', { min: prefs.ageMin, max: prefs.ageMax })}
          </Text>
          <View style={{ flexDirection: 'row', gap: spacing.md }}>
            <Stepper label={t('me.prefs.from')} value={prefs.ageMin} min={AGE_MIN} max={prefs.ageMax} onChange={(v) => set('ageMin', v)} testID="prefs-age-min" />
            <Stepper label={t('me.prefs.to')} value={prefs.ageMax} min={prefs.ageMin} max={AGE_MAX} onChange={(v) => set('ageMax', v)} testID="prefs-age-max" />
          </View>
        </Field>

        <Field label={t('me.prefs.marital')}>
          <ChipRow>
            <Chip label={t('me.prefs.any')} selected={prefs.maritalStatuses === null} onPress={() => set('maritalStatuses', null)} />
            {MARITAL.map((m) => (
              <Chip key={m} label={t(`common.marital.${m}`)} selected={!!prefs.maritalStatuses?.includes(m)} onPress={() => toggleMarital(m)} />
            ))}
          </ChipRow>
        </Field>

        <View style={styles.group}>
          <ToggleRow label={t('me.prefs.children')} description={t('me.prefs.childrenBody')} value={prefs.acceptChildren} onChange={(v) => set('acceptChildren', v)} />
          <View style={styles.sep} />
          <ToggleRow
            label={t('me.prefs.verifiedOnly')}
            description={t('me.prefs.verifiedOnlyBody')}
            value={prefs.verifiedOnly}
            onChange={(v) => set('verifiedOnly', v)}
            disabled={!advanced}
            locked={!advanced}
          />
        </View>

        <Field label={t('me.prefs.languages')} hint={t('me.prefs.languagesHint')}>
          <ChipRow>
            {LANGUAGES.map((l) => (
              <Chip
                key={l.code}
                label={languageLabel(l.code, locale)}
                selected={!!prefs.languages?.includes(l.code)}
                disabled={!advanced}
                onPress={() => toggleLanguage(l.code)}
              />
            ))}
          </ChipRow>
        </Field>

        {!advanced ? (
          <Card tone="premium" onPress={openPaywall} accessibilityLabel={t('me.prefs.locked')}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Icon name="lock-closed" size={16} color="#8A6A22" />
              <Text variant="small" style={{ flex: 1 }}>
                {t('me.prefs.locked')}
              </Text>
              <Text variant="small" weight="semibold" color="#8A6A22">
                {t('me.prefs.unlock')}
              </Text>
            </View>
          </Card>
        ) : null}

        <View style={{ gap: spacing.md }}>
          <SectionTitle title={t('me.prefs.values')} style={{ marginBottom: 0 }} />
          <Text variant="caption" color={colors.textMuted}>
            {t('me.prefs.valuesHint')}
          </Text>
          {DIMENSIONS.map((d) => {
            const value = prefs.dimensionImportance[d] ?? 'important';
            return (
              <View key={d} style={styles.dim} testID={`prefs-dim-${d}`}>
                <Text variant="bodyStrong">{t(`common.dimension.${d}`)}</Text>
                <ChipRow>
                  {IMPORTANCE_ORDER.map((imp) => (
                    <Chip
                      key={imp}
                      size="sm"
                      tone={imp === 'dealbreaker' ? 'danger' : 'primary'}
                      label={t(`common.importance.${imp}`)}
                      selected={value === imp}
                      onPress={() => setImportance(d, imp)}
                    />
                  ))}
                </ChipRow>
              </View>
            );
          })}
          {hasDealbreaker ? <InlineNote tone="danger" text={t('me.prefs.dealbreakerWarn')} /> : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { backgroundColor: colors.card, borderRadius: radii.xl, borderWidth: 1, borderColor: colors.borderSoft, overflow: 'hidden' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  dim: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSoft,
    backgroundColor: colors.card,
  },
});
