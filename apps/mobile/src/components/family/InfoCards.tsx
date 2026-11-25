import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, type IconName, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, palette, spacing } from '@/theme';

function IconBubble({ name, bg = colors.primaryTint, color = colors.primary }: { name: IconName; bg?: string; color?: string }) {
  return (
    <View style={[styles.bubble, { backgroundColor: bg }]}>
      <Icon name={name} size={20} color={color} />
    </View>
  );
}

function InfoCard({
  icon,
  title,
  children,
  tone = 'default',
  bubbleBg,
  bubbleColor,
  testID,
}: {
  icon: IconName;
  title: string;
  children: ReactNode;
  tone?: 'default' | 'muted' | 'primary' | 'premium';
  bubbleBg?: string;
  bubbleColor?: string;
  testID?: string;
}) {
  return (
    <Card tone={tone}>
      <View testID={testID} style={styles.row}>
        <IconBubble name={icon} bg={bubbleBg} color={bubbleColor} />
        <View style={{ flex: 1, gap: spacing.sm }}>
          <Text variant="subheading">{title}</Text>
          {children}
        </View>
      </View>
    </Card>
  );
}

/** "A guardian walks beside you" — role, control, and that guardians never browse or match. */
export function IntroCard() {
  const t = useT();
  return (
    <InfoCard icon="people-outline" title={t('family.intro.heading')} testID="family-intro">
      <Text variant="body" color={colors.textMuted}>
        {t('family.intro.body')}
      </Text>
      <Text variant="body" color={colors.textMuted}>
        {t('family.intro.body2')}
      </Text>
      <Text variant="caption" color={colors.textSubtle}>
        {t('family.intro.browseNote')}
      </Text>
    </InfoCard>
  );
}

/** Always visible, never silent (spec 01 §44). */
export function DisclosureCard() {
  const t = useT();
  return (
    <InfoCard icon="eye-outline" title={t('family.disclosure.title')} tone="primary" bubbleBg={palette.white} testID="family-disclosure">
      <Text variant="small" color={colors.textMuted}>
        {t('family.disclosure.body')}
      </Text>
      <Text variant="small" color={colors.textMuted}>
        {t('family.disclosure.body2')}
      </Text>
    </InfoCard>
  );
}

/** Wali-mode users see the invitation first and prominently. */
export function WaliInviteCard({ onInvite }: { onInvite: () => void }) {
  const t = useT();
  return (
    <InfoCard icon="home-outline" title={t('family.invite.waliTitle')} tone="premium" bubbleBg={palette.white} bubbleColor="#8A6A22" testID="family-wali-card">
      <Text variant="body" color={colors.textMuted}>
        {t('family.invite.waliBody')}
      </Text>
      <Button label={t('family.actions.invite')} icon="person-add-outline" size="lg" fullWidth onPress={onInvite} testID="family-invite-wali" />
    </InfoCard>
  );
}

/** Coercion safeguard (spec 05 §3.5): a private route to support, never shared with the guardian. */
export function PressureCard() {
  const t = useT();
  return (
    <InfoCard icon="heart-circle-outline" title={t('family.pressure.title')} tone="muted" testID="family-pressure">
      <Text variant="small" color={colors.textMuted}>
        {t('family.pressure.body')}
      </Text>
      <Button
        label={t('family.pressure.action')}
        variant="ghost"
        size="sm"
        iconEnd="chevron-forward"
        directionalIcon
        style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
        onPress={() => router.push('/settings/safety')}
        testID="family-pressure-safety"
      />
    </InfoCard>
  );
}

/**
 * Where guardians live: in mock mode a demo backend inside the app (with "Simulate acceptance" and a
 * demo invitation for the guardian side); in live mode the real service.
 */
export function BackendCard({ mock, onTryGuardianSide }: { mock: boolean; onTryGuardianSide?: () => void }) {
  const t = useT();
  if (!mock) {
    return (
      <InfoCard icon="link-outline" title={t('family.backend.liveTitle')} tone="muted" testID="family-backend">
        <Text variant="small" color={colors.textMuted}>
          {t('family.backend.liveBody')}
        </Text>
        <Text variant="small" color={colors.textMuted}>
          {t('family.backend.liveBody2')}
        </Text>
      </InfoCard>
    );
  }
  return (
    <InfoCard icon="flask-outline" title={t('family.backend.mockTitle')} tone="muted" bubbleBg={colors.premiumSoft} bubbleColor="#8A6A22" testID="family-backend">
      <Text variant="small" color={colors.textMuted}>
        {t('family.backend.mockBody')}
      </Text>
      <Text variant="small" color={colors.textMuted}>
        {t('family.backend.mockBody2')}
      </Text>
      {onTryGuardianSide ? (
        <Button
          label={t('family.backend.tryGuardianSide')}
          icon="people-circle-outline"
          variant="outline"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          onPress={onTryGuardianSide}
          testID="family-try-guardian-side"
        />
      ) : null}
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  bubble: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
});
