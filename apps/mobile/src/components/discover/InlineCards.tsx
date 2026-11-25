import type { Dimension } from '@halal-meet/core';
import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button, Card, Icon, type IconName, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, palette, spacing } from '@/theme';

function InlineShell({ icon, tone = 'default', title, body, children, testID }: {
  icon: IconName;
  tone?: 'default' | 'premium' | 'primary' | 'muted';
  title: string;
  body: string;
  children?: ReactNode;
  testID?: string;
}) {
  const iconColor = tone === 'premium' ? palette.gold500 : colors.primary;
  return (
    <View style={styles.wrap} testID={testID}>
      <Card tone={tone} style={{ gap: spacing.md }}>
        <View style={styles.row}>
          <View style={[styles.icon, tone === 'premium' && { backgroundColor: palette.white }]}>
            <Icon name={icon} size={18} color={iconColor} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text variant="subheading">{title}</Text>
            <Text variant="small" color={colors.textMuted}>
              {body}
            </Text>
          </View>
        </View>
        {children ? <View style={styles.actions}>{children}</View> : null}
      </Card>
    </View>
  );
}

export function DailyQuestionCard() {
  const t = useT();
  return (
    <InlineShell icon="help-circle-outline" tone="primary" title={t('discover.inline.question.title')} body={t('discover.inline.question.body')} testID="inline-daily-question">
      <Button label={t('discover.inline.question.cta')} size="sm" onPress={() => router.push('/settings/questions')} />
    </InlineShell>
  );
}

export function RevealCard({ dimension, n }: { dimension: Dimension; n: number }) {
  const t = useT();
  const dim = t(`common.dimension.${dimension}`);
  return (
    <InlineShell icon="lock-open-outline" title={t('discover.inline.reveal.title', { n, dimension: dim })} body={t('discover.inline.reveal.body', { n, dimension: dim })} testID="inline-reveal">
      <Button label={t('discover.inline.reveal.cta')} size="sm" variant="secondary" onPress={() => router.push('/settings/questions')} />
    </InlineShell>
  );
}

export function UpsellCard({ onDismiss }: { onDismiss: () => void }) {
  const t = useT();
  return (
    <InlineShell icon="sparkles" tone="premium" title={t('discover.inline.upsell.title')} body={t('discover.inline.upsell.body')} testID="inline-upsell">
      <Button
        label={t('discover.inline.upsell.cta')}
        size="sm"
        variant="gold"
        onPress={() => router.push({ pathname: '/paywall', params: { trigger: 'interests' } })}
      />
      <Button label={t('discover.inline.upsell.keepBrowsing')} size="sm" variant="ghost" onPress={onDismiss} />
    </InlineShell>
  );
}

export function MindfulCard() {
  const t = useT();
  return (
    <InlineShell icon="leaf-outline" tone="muted" title={t('discover.inline.mindful.title')} body={t('discover.inline.mindful.body')} testID="inline-mindful">
      <Button label={t('discover.inline.mindful.preferences')} size="sm" variant="secondary" onPress={() => router.push('/settings/preferences')} />
      <Button label={t('discover.inline.mindful.questions')} size="sm" variant="ghost" onPress={() => router.push('/settings/questions')} />
    </InlineShell>
  );
}

/** "You've seen your strongest matches" — broader matches stay behind an explicit choice. */
export function BroaderDivider({ open, onContinue }: { open: boolean; onContinue: () => void }) {
  const t = useT();
  return (
    <View style={[styles.wrap, { gap: spacing.md }]} testID="broader-divider">
      <View style={styles.dividerRow}>
        <View style={styles.line} />
        <Text variant="overline" color={colors.textMuted}>
          {t('discover.divider.label')}
        </Text>
        <View style={styles.line} />
      </View>
      {!open ? (
        <Card tone="muted" style={{ gap: spacing.sm, alignItems: 'center' }}>
          <Text variant="subheading" center>
            {t('discover.divider.title')}
          </Text>
          <Text variant="small" color={colors.textMuted} center>
            {t('discover.divider.body')}
          </Text>
          <Button label={t('discover.divider.continue')} variant="outline" size="sm" onPress={onContinue} testID="broader-continue" />
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingBottom: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  icon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primaryTint, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, paddingStart: 48 },
  dividerRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: colors.border },
});
