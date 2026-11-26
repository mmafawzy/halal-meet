import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { InlineNote, OnboardingFrame } from '@/components/onboarding/OnboardingFrame';
import { Card, Field, Icon, OptionCard, RowGroup, Text, TextField, ToggleRow, Button, type IconName } from '@/components/ui';
import { finishNotificationSetup, toServerTopPicksTime } from '@/components/notifications/registration';
import { useT } from '@/i18n';
import { useSession, type OnboardingDraft } from '@/state/session';
import { colors, spacing } from '@/theme';

type TopPicksTime = OnboardingDraft['topPicksTime'];

const TIMES: TopPicksTime[] = ['after_maghrib', 'morning', 'evening', 'custom'];
const TIME_ICONS: Record<TopPicksTime, IconName> = {
  after_maghrib: 'moon-outline',
  morning: 'sunny-outline',
  evening: 'cloudy-night-outline',
  custom: 'time-outline',
};

const isValidTime = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());

/**
 * Screen 20 — guardian & notifications setup: Top Picks delivery time, the notification explanation
 * (shown before any permission prompt) and the "Add a guardian?" pointer to the Family tab.
 * The choices are stored in the onboarding draft and saved with PUT /me/notification-prefs; "Finish" then asks
 * for the OS notification permission (native) and registers the push token in live mode.
 * The guardian invite lives in the Family tab.
 */
export default function NotificationsScreen() {
  const t = useT();
  const draft = useSession((s) => s.draft);
  const updateDraft = useSession((s) => s.updateDraft);

  const [time, setTime] = useState<TopPicksTime>(draft.topPicksTime);
  const [custom, setCustom] = useState(draft.customTime);
  const [notify, setNotify] = useState(draft.notifications);

  const customInvalid = time === 'custom' && !isValidTime(custom);
  const wali = draft.halalMode === 'wali';

  const [saving, setSaving] = useState(false);
  const finish = async () => {
    if (customInvalid || saving) return;
    updateDraft({ topPicksTime: time, customTime: custom.trim(), notifications: notify });
    // The OS permission prompt comes only now, after the explanation above (higher opt-in, spec 01 §20).
    setSaving(true);
    await finishNotificationSetup({ wantsPush: notify, topPicksTime: toServerTopPicksTime(time, custom) }).catch(() => undefined);
    setSaving(false);
    router.push('/(onboarding)/ready');
  };

  return (
    <OnboardingFrame
      step="notifications"
      title={t('onboarding.notifications.title')}
      subtitle={t('onboarding.notifications.subtitle')}
      keyboard
      footer={
        <Button
          label={t('onboarding.notifications.finish')}
          size="lg"
          fullWidth
          disabled={customInvalid}
          loading={saving}
          onPress={() => void finish()}
          testID="notifications-finish"
        />
      }
    >
      <View style={{ gap: spacing.md }}>
        {TIMES.map((k) => (
          <OptionCard
            key={k}
            icon={TIME_ICONS[k]}
            title={t(`onboarding.notifications.times.${k}`)}
            description={t(`onboarding.notifications.timesDesc.${k}`)}
            badge={k === 'after_maghrib' ? t('onboarding.notifications.recommended') : undefined}
            selected={time === k}
            onPress={() => setTime(k)}
          />
        ))}
        {time === 'custom' ? (
          <Field label={t('onboarding.notifications.customLabel')} error={customInvalid && custom.length >= 4 ? t('onboarding.notifications.customInvalid') : null}>
            <TextField
              value={custom}
              onChangeText={setCustom}
              placeholder="21:00"
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              testID="notifications-custom-time"
            />
          </Field>
        ) : null}
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="subheading">{t('onboarding.notifications.notifTitle')}</Text>
        <Text variant="small" color={colors.textMuted}>
          {t('onboarding.notifications.notifBody')}
        </Text>
        <RowGroup>
          <ToggleRow
            icon="notifications-outline"
            label={t('onboarding.notifications.notifToggle')}
            description={t('onboarding.notifications.notifToggleDesc')}
            value={notify}
            onChange={setNotify}
          />
        </RowGroup>
      </View>

      <Card tone={wali ? 'premium' : 'muted'}>
        <View style={{ gap: spacing.sm }}>
          <View style={styles.row}>
            <Icon name="people-outline" size={20} color={colors.primary} />
            <Text variant="subheading" style={{ flex: 1 }}>
              {t('onboarding.notifications.guardianTitle')}
            </Text>
          </View>
          <Text variant="small" color={colors.textMuted}>
            {t('onboarding.notifications.guardianBody')}
          </Text>
          {wali ? <InlineNote tone="primary" icon="star-outline" text={t('onboarding.notifications.guardianWali')} /> : null}
        </View>
      </Card>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
