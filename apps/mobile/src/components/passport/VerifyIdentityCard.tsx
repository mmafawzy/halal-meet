import { View } from 'react-native';

import { api } from '@/api';
import { useVerifyIdentityDemo } from '@/api/hooks';
import { Button, Card, Icon, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, palette, spacing } from '@/theme';

/** Passport needs 🔵 Identity Verified (spec 01 §72, 05 §3.2). Mock mode offers a demo verification. */
export function VerifyIdentityCard() {
  const t = useT();
  const verify = useVerifyIdentityDemo();
  const showToast = useUi((s) => s.showToast);
  const canDemo = !!api.dev;

  return (
    <Card tone="primary" style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: palette.white,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="shield-checkmark" size={20} color={palette.blue600} />
        </View>
        <Text variant="bodyStrong" style={{ flex: 1 }}>
          {t('passport.verify.title')}
        </Text>
      </View>
      <Text variant="small" color={colors.textMuted}>
        {t('passport.verify.body')}
      </Text>
      {canDemo ? (
        <Button
          label={t('passport.verify.action')}
          icon="shield-checkmark-outline"
          variant="secondary"
          loading={verify.isPending}
          onPress={() =>
            verify.mutate(undefined, {
              onSuccess: () => showToast({ message: t('passport.verify.done'), tone: 'success' }),
              onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
            })
          }
          testID="passport-verify"
        />
      ) : (
        <Text variant="caption" color={colors.textSubtle}>
          {t('passport.verify.unavailable')}
        </Text>
      )}
    </Card>
  );
}
