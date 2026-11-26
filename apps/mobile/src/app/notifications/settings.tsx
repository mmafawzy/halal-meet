import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPrefsInput } from '@halal-meet/core';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useNotificationPrefs, usePutNotificationPrefs } from '@/components/notifications/hooks';
import { registerPushDevice } from '@/components/notifications/registration';
import { Button, Card, ErrorState, Field, Header, LoadingState, OptionCard, RowGroup, Screen, Text, TextField, ToggleRow, type IconName } from '@/components/ui';
import { useT } from '@/i18n';
import { getPushPermission, requestPushPermission, type PushPermission } from '@/lib/push';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

type TimeChoice = 'maghrib' | 'morning' | 'evening' | 'custom';
const TIMES: TimeChoice[] = ['maghrib', 'morning', 'evening', 'custom'];
const TIME_ICONS: Record<TimeChoice, IconName> = {
  maghrib: 'moon-outline',
  morning: 'sunny-outline',
  evening: 'cloudy-night-outline',
  custom: 'time-outline',
};
const CATEGORY_ICONS: Record<NotificationCategory, IconName> = {
  matches: 'heart-outline',
  messages: 'chatbubble-outline',
  interests: 'sparkles-outline',
  family: 'people-outline',
  topPicks: 'diamond-outline',
  tips: 'bulb-outline',
};
const isHHMM = (v: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim());

const PERMISSION_KEY: Record<PushPermission, string> = {
  granted: 'notifications.settings.pushGranted',
  denied: 'notifications.settings.pushDenied',
  undetermined: 'notifications.settings.pushUndetermined',
  unsupported: 'notifications.settings.pushUnsupported',
};

/** Notification settings (spec 01 §61): granular categories, Top Picks time, quiet hours, device permission. */
export default function NotificationSettings() {
  const t = useT();
  const prefs = useNotificationPrefs();
  const put = usePutNotificationPrefs();
  const showToast = useUi((s) => s.showToast);
  const [permission, setPermission] = useState<PushPermission>('unsupported');
  const [custom, setCustom] = useState('');
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    void getPushPermission().then(setPermission);
  }, []);

  const current = prefs.data?.topPicksTime ?? 'maghrib';
  useEffect(() => {
    if (isHHMM(current)) setCustom(current);
  }, [current]);

  const header = <Header title={t('notifications.settings.title')} />;
  if (prefs.isLoading) return <Screen header={header}><LoadingState /></Screen>;
  if (prefs.isError || !prefs.data) return <Screen header={header}><ErrorState onRetry={() => void prefs.refetch()} /></Screen>;
  const p = prefs.data;
  const selected: TimeChoice = customOpen || isHHMM(p.topPicksTime) ? 'custom' : (p.topPicksTime as TimeChoice);

  const save = (body: NotificationPrefsInput) =>
    put.mutate(body, { onSuccess: () => showToast({ message: t('notifications.settings.saved'), tone: 'success' }) });

  const allow = async () => {
    const r = await requestPushPermission();
    setPermission(r);
    if (r === 'granted') await registerPushDevice();
  };

  return (
    <Screen header={header} testID="notification-settings" keyboard>
      <View style={{ gap: spacing.xl }}>
        <Text variant="small" color={colors.textMuted}>
          {t('notifications.settings.intro')}
        </Text>

        <Card tone="muted" style={{ gap: spacing.sm }}>
          <Text variant="subheading">{t('notifications.settings.pushTitle')}</Text>
          <Text variant="small" color={colors.textMuted}>
            {t(PERMISSION_KEY[permission])}
          </Text>
          {permission === 'undetermined' ? (
            <Button
              label={t('notifications.settings.pushAllow')}
              size="sm"
              variant="secondary"
              style={{ alignSelf: 'flex-start' }}
              onPress={() => void allow()}
              testID="notification-allow"
            />
          ) : null}
        </Card>

        <RowGroup title={t('notifications.settings.categoriesTitle')}>
          {NOTIFICATION_CATEGORIES.map((c) => (
            <ToggleRow
              key={c}
              icon={CATEGORY_ICONS[c]}
              label={t(`notifications.settings.categories.${c}`)}
              description={t(`notifications.settings.categoriesDesc.${c}`)}
              value={p.categories[c]}
              onChange={(v) => save({ categories: { [c]: v } })}
            />
          ))}
        </RowGroup>

        <View style={{ gap: spacing.sm }}>
          <Text variant="subheading">{t('notifications.settings.timeTitle')}</Text>
          <Text variant="small" color={colors.textMuted}>
            {t('notifications.settings.timeBody')}
          </Text>
          {TIMES.map((k) => (
            <OptionCard
              key={k}
              icon={TIME_ICONS[k]}
              title={t(`notifications.settings.times.${k}`)}
              selected={selected === k}
              onPress={() => {
                if (k === 'custom') {
                  setCustomOpen(true);
                  return;
                }
                setCustomOpen(false);
                save({ topPicksTime: k });
              }}
            />
          ))}
          {selected === 'custom' ? (
            <View style={{ gap: spacing.sm }}>
              <Field
                label={t('notifications.settings.customLabel')}
                error={custom.length >= 4 && !isHHMM(custom) ? t('notifications.settings.customInvalid') : null}
              >
                <TextField
                  value={custom}
                  onChangeText={setCustom}
                  placeholder="21:00"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                  testID="notification-custom-time"
                />
              </Field>
              <Button
                label={t('notifications.settings.customSave')}
                size="sm"
                style={{ alignSelf: 'flex-start' }}
                disabled={!isHHMM(custom)}
                onPress={() => {
                  setCustomOpen(false);
                  save({ topPicksTime: custom.trim() });
                }}
                testID="notification-custom-save"
              />
            </View>
          ) : null}
        </View>

        <RowGroup title={t('notifications.settings.quietTitle')}>
          <ToggleRow
            icon="moon-outline"
            label={t('notifications.settings.quietLabel')}
            description={t('notifications.settings.quietDesc')}
            value={p.quietHours}
            onChange={(v) => save({ quietHours: v })}
          />
        </RowGroup>
      </View>
    </Screen>
  );
}
