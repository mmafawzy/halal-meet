import { PLAN_LIMITS } from '@halal-meet/core';
import { router } from 'expo-router';
import { View } from 'react-native';

import { useMe } from '../../api/hooks';
import { useT } from '../../i18n';
import { timeUntil } from '../../lib/format';
import { useLocal } from '../../state/local';
import { useUi } from '../../state/ui';
import { colors, spacing } from '../../theme';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Icon } from '../ui/Icon';
import { Sheet } from '../ui/Sheet';
import { Text } from '../ui/Text';

/** Screen 27 — shown when a free user taps "I'm interested" after using all daily interests. */
export function LimitSheet() {
  const t = useT();
  const { visible, card, usage: errUsage } = useUi((s) => s.limitSheet);
  const close = useUi((s) => s.closeLimitSheet);
  const showToast = useUi((s) => s.showToast);
  const me = useMe();
  const saved = useLocal((s) => s.saved);
  const save = useLocal((s) => s.save);

  const usage = errUsage ?? me.data?.usage ?? null;
  const tier = me.data?.entitlements.tier ?? 'free';
  const left = usage ? timeUntil(usage.resetsAt) : { h: 0, m: 0 };
  const limit = usage?.interestsLimit ?? PLAN_LIMITS.free.dailyInterests ?? 10;
  const seriousLeft = usage ? usage.seriousUsed < usage.seriousLimit : false;
  const savedCap = PLAN_LIMITS[tier].savedProfiles;

  return (
    <Sheet visible={visible} onClose={close} testID="limit-sheet">
      <View style={{ alignItems: 'center', gap: spacing.md, paddingTop: spacing.sm }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: colors.premiumSoft, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="hourglass-outline" size={26} color={colors.premium} />
        </View>
        <Text variant="heading" center>
          {t('common.limitSheet.title', { limit })}
        </Text>
        <Text variant="body" color={colors.textMuted} center>
          {t('common.limitSheet.body', { time: t('common.time.hm', { h: left.h, m: left.m }) })}
        </Text>
      </View>

      {card ? (
        <Card tone="muted" style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Avatar id={card.id} name={card.firstName} photoUrl={card.photoUrl} photoState={card.photoState} size={44} />
          <View style={{ flex: 1 }}>
            <Text variant="bodyStrong">{card.firstName}</Text>
            <Text variant="caption" color={colors.textMuted}>
              {t('common.limitSheet.saveHint')}
            </Text>
          </View>
        </Card>
      ) : null}

      {seriousLeft ? (
        <Text variant="small" color={colors.primary} center>
          {t('common.limitSheet.seriousLeft')}
        </Text>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        {card ? (
          <Button
            label={t('common.limitSheet.save')}
            icon="bookmark-outline"
            variant="secondary"
            fullWidth
            onPress={() => {
              if (savedCap !== null && saved.length >= savedCap && !saved.some((c) => c.id === card.id)) {
                showToast({ message: t('common.limitSheet.savedFull'), tone: 'danger' });
                return;
              }
              save(card);
              close();
              showToast({ message: t('common.limitSheet.savedToast'), tone: 'success', durationMs: 2000 });
            }}
          />
        ) : null}
        <Button
          label={t('common.limitSheet.upgrade')}
          icon="sparkles"
          variant="gold"
          fullWidth
          onPress={() => {
            close();
            router.push({ pathname: '/paywall', params: { trigger: 'interests' } });
          }}
        />
        <Button label={t('common.limitSheet.keepBrowsing')} variant="ghost" fullWidth onPress={close} />
      </View>
    </Sheet>
  );
}
