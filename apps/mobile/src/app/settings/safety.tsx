import { COUNTRIES } from '@halal-meet/core';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { useMe } from '@/api/hooks';
import { emergencyNumber, EMERGENCY_NUMBERS } from '@/components/me/emergency';
import { InlineNote } from '@/components/onboarding/OnboardingFrame';
import { BlockedList } from '@/components/privacy/BlockedList';
import { usePause, usePrivacyStatus } from '@/components/privacy/usePrivacy';
import { Button, Card, Header, Icon, ListRow, RowGroup, Screen, SectionTitle, Sheet, Text, type IconName } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { countryFlag, countryName } from '@/lib/format';
import { useSession } from '@/state/session';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

const TIPS: Array<{ key: string; icon: IconName }> = [
  { key: 'money', icon: 'cash-outline' },
  { key: 'platform', icon: 'chatbubbles-outline' },
  { key: 'video', icon: 'videocam-outline' },
  { key: 'details', icon: 'home-outline' },
  { key: 'family', icon: 'people-outline' },
];

const MEETING: Array<{ key: string; icon: IconName }> = [
  { key: 'public', icon: 'cafe-outline' },
  { key: 'tell', icon: 'call-outline' },
  { key: 'transport', icon: 'car-outline' },
  { key: 'leave', icon: 'exit-outline' },
];

function call(number: string) {
  void Linking.openURL(`tel:${number}`).catch(() => undefined);
}

/**
 * Safety Center (screen 59, spec 05 §3.5). Never paywalled. Includes the private "I'm being
 * pressured" entry: it shows confidential support resources and never notifies a guardian.
 */
export default function SafetyCenterScreen() {
  const t = useT();
  const locale = useLocale();
  const me = useMe();
  const draftCountry = useSession((s) => s.draft.country);
  const country = me.data?.profile?.country ?? draftCountry ?? null;
  const privacy = usePrivacyStatus();
  const pause = usePause();
  const [pressuredOpen, setPressuredOpen] = useState(false);
  const [othersOpen, setOthersOpen] = useState(false);

  const local = emergencyNumber(country);
  const others = COUNTRIES.filter((c) => c.code !== country && EMERGENCY_NUMBERS[c.code]);

  const pauseNow = () => {
    // Open-ended pause (PUT /me/pause); nobody (including a guardian) is notified.
    pause.mutate(null, {
      onSuccess: () => useUi.getState().showToast({ message: t('me.privacy.pausedToast'), tone: 'success' }),
      onError: () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' }),
    });
  };

  return (
    <Screen header={<Header title={t('me.safety.title')} />} testID="safety-screen">
      <View style={{ gap: spacing.xl }}>
        <Text variant="small" color={colors.textMuted}>
          {t('me.safety.subtitle')}
        </Text>

        {/* Private coercion-support entry (spec 05 §3.5). */}
        <Card tone="primary" onPress={() => setPressuredOpen(true)} accessibilityLabel={t('me.safety.pressured.title')}>
          <View style={styles.headRow}>
            <View style={styles.iconBubble}>
              <Icon name="hand-left-outline" size={20} color={colors.primary} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text variant="subheading">{t('me.safety.pressured.title')}</Text>
              <Text variant="caption" color={colors.textMuted}>
                {t('me.safety.pressured.body')}
              </Text>
            </View>
            <Icon name="chevron-forward" size={18} color={colors.textSubtle} directional />
          </View>
        </Card>

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.safety.emergencyTitle')} style={{ marginBottom: 0 }} />
          <Text variant="caption" color={colors.textMuted}>
            {t('me.safety.emergencyBody')}
          </Text>
          <RowGroup>
            {country ? (
              <ListRow
                icon="call-outline"
                iconColor={colors.danger}
                label={`${countryFlag(country)} ${countryName(country, locale)}`}
                right={<NumberPill number={local} />}
                onPress={() => call(local)}
              />
            ) : null}
            <ListRow
              icon="globe-outline"
              label={t('me.safety.others')}
              right={<Icon name={othersOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textSubtle} />}
              onPress={() => setOthersOpen((v) => !v)}
            />
            {othersOpen
              ? others.map((c) => (
                  <ListRow
                    key={c.code}
                    label={`${c.flag} ${c.name[locale]}`}
                    right={<NumberPill number={EMERGENCY_NUMBERS[c.code]!} />}
                    onPress={() => call(EMERGENCY_NUMBERS[c.code]!)}
                  />
                ))
              : null}
          </RowGroup>
        </View>

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.safety.report.title')} style={{ marginBottom: 0 }} />
          <Card>
            <View style={{ gap: spacing.sm }}>
              <InfoLine icon="flag-outline" text={t('me.safety.report.body')} />
              <InfoLine icon="list-outline" text={t('me.safety.report.categories')} />
            </View>
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.safety.blocked.title')} style={{ marginBottom: 0 }} />
          <BlockedList />
        </View>

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.safety.tipsTitle')} style={{ marginBottom: 0 }} />
          <Card>
            <View style={{ gap: spacing.md }}>
              {TIPS.map((tip) => (
                <InfoLine key={tip.key} icon={tip.icon} text={t(`me.safety.tips.${tip.key}`)} strong={tip.key === 'money'} />
              ))}
            </View>
          </Card>
        </View>

        <View style={{ gap: spacing.sm }}>
          <SectionTitle title={t('me.safety.meetingTitle')} style={{ marginBottom: 0 }} />
          <Card>
            <View style={{ gap: spacing.md }}>
              {MEETING.map((m) => (
                <InfoLine key={m.key} icon={m.icon} text={t(`me.safety.meeting.${m.key}`)} />
              ))}
            </View>
          </Card>
        </View>
      </View>

      <Sheet
        visible={pressuredOpen}
        onClose={() => setPressuredOpen(false)}
        title={t('me.safety.pressured.sheetTitle')}
        testID="safety-pressured-sheet"
        footer={
          <View style={{ gap: spacing.sm }}>
            <Button label={t('me.safety.call', { number: local })} variant="danger" icon="call-outline" fullWidth onPress={() => call(local)} />
            {!privacy.data?.paused ? (
              <Button label={t('me.safety.pressured.pauseCta')} variant="outline" icon="pause-outline" fullWidth loading={pause.isPending} onPress={pauseNow} testID="safety-pause" />
            ) : null}
            <Button label={t('common.actions.close')} variant="ghost" fullWidth onPress={() => setPressuredOpen(false)} />
          </View>
        }
      >
        <View style={{ gap: spacing.lg }}>
          <Text variant="body">{t('me.safety.pressured.sheetBody')}</Text>
          <View style={styles.private}>
            <Icon name="eye-off-outline" size={18} color={colors.primary} />
            <Text variant="small" color={colors.primary} style={{ flex: 1 }}>
              {t('me.safety.pressured.private')}
            </Text>
          </View>
          <InfoLine icon="people-outline" text={t('me.safety.pressured.steps.talk')} />
          <InfoLine icon="pause-circle-outline" text={t('me.safety.pressured.steps.pause')} />
          <InfoLine icon="alert-circle-outline" text={t('me.safety.pressured.steps.danger')} strong />
          <InlineNote text={t('me.safety.pressured.team')} />
        </View>
      </Sheet>
    </Screen>
  );
}

function InfoLine({ icon, text, strong }: { icon: IconName; text: string; strong?: boolean }) {
  return (
    <View style={styles.info}>
      <Icon name={icon} size={18} color={strong ? colors.danger : colors.primary} style={{ marginTop: 1 }} />
      <Text variant="small" weight={strong ? 'semibold' : 'regular'} style={{ flex: 1 }}>
        {text}
      </Text>
    </View>
  );
}

function NumberPill({ number }: { number: string }) {
  return (
    // Display only: the whole row is the call button (a nested button is invalid on web).
    <View style={styles.pill}>
      <Text variant="small" weight="bold" fontLocale="en" color={colors.danger} style={{ writingDirection: 'ltr' }}>
        {number}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconBubble: { width: 40, height: 40, borderRadius: 20, backgroundColor: palette.white, alignItems: 'center', justifyContent: 'center' },
  info: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  private: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start', padding: spacing.md, borderRadius: radii.md, backgroundColor: colors.primaryTint },
  pill: { paddingHorizontal: spacing.md, paddingVertical: 4, borderRadius: radii.pill, backgroundColor: colors.dangerSoft },
});
