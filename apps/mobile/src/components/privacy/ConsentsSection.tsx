import { CONSENT_KINDS, REQUIRED_CONSENTS, type ConsentKind } from '@halal-meet/core';
import { View } from 'react-native';

import { RowGroup, Tag, Text, ToggleRow } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { formatDate } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, spacing } from '@/theme';

import { useConsents, usePutConsent } from './usePrivacy';

/** What the member agreed to, and when (GET /me/consents). Required ones are shown but can't be switched off. */
export function ConsentsSection() {
  const t = useT();
  const locale = useLocale();
  const consents = useConsents();
  const put = usePutConsent();
  const byKind = new Map((consents.data ?? []).map((c) => [c.kind, c]));

  const change = (kind: ConsentKind, granted: boolean) =>
    put.mutate({ kind, granted }, { onError: () => useUi.getState().showToast({ message: t('common.states.error'), tone: 'danger' }) });

  return (
    <View style={{ gap: spacing.sm }} testID="privacy-consents">
      <RowGroup title={t('me.privacy.consents.title')}>
        {CONSENT_KINDS.map((kind) => {
          const c = byKind.get(kind);
          const required = REQUIRED_CONSENTS.includes(kind);
          const description = c?.granted ? t('me.privacy.consents.since', { date: formatDate(c.decidedAt, locale, { day: 'numeric', month: 'short', year: 'numeric' }) }) : t('me.privacy.consents.notGiven');
          if (required) {
            return (
              <View key={kind} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="bodyStrong">{t(`me.privacy.consents.kinds.${kind}`)}</Text>
                  <Text variant="caption" color={colors.textMuted}>
                    {description}
                  </Text>
                </View>
                <Tag label={t('me.privacy.consents.required')} />
              </View>
            );
          }
          return (
            <ToggleRow
              key={kind}
              label={t(`me.privacy.consents.kinds.${kind}`)}
              description={description}
              value={!!c?.granted}
              onChange={(v) => change(kind, v)}
              disabled={put.isPending}
            />
          );
        })}
      </RowGroup>
      <Text variant="caption" color={colors.textMuted}>
        {t('me.privacy.consents.body')}
      </Text>
    </View>
  );
}
