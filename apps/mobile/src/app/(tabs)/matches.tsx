import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { useIncoming } from '@/api/hooks';
import { IncomingList } from '@/components/matches/IncomingList';
import { MutualList } from '@/components/matches/MutualList';
import { SavedList } from '@/components/matches/SavedList';
import { Screen, Segmented, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { colors, spacing } from '@/theme';

type Tab = 'mutual' | 'incoming' | 'saved';

function isTab(v: unknown): v is Tab {
  return v === 'mutual' || v === 'incoming' || v === 'saved';
}

/** Screens 30 / 31 / 33 — Matches hub. Optional `?tab=incoming|saved` deep link. */
export default function MatchesScreen() {
  const t = useT();
  const params = useLocalSearchParams<{ tab?: string }>();
  const [tab, setTab] = useState<Tab>(isTab(params.tab) ? params.tab : 'mutual');
  const incoming = useIncoming();
  const incomingCount = incoming.data?.count ?? 0;

  useEffect(() => {
    if (isTab(params.tab)) setTab(params.tab);
  }, [params.tab]);

  return (
    <Screen edges={['top']} pattern>
      <View style={{ gap: 2, marginBottom: spacing.lg, marginTop: spacing.sm }}>
        <Text variant="title">{t('matches.title')}</Text>
        <Text variant="small" color={colors.textMuted}>
          {t('matches.subtitle')}
        </Text>
      </View>
      <Segmented<Tab>
        value={tab}
        onChange={setTab}
        options={[
          { value: 'mutual', label: t('matches.tabs.mutual') },
          { value: 'incoming', label: t('matches.tabs.incoming'), badge: incomingCount > 0 ? String(incomingCount) : undefined },
          { value: 'saved', label: t('matches.tabs.saved') },
        ]}
        style={{ marginBottom: spacing.xl }}
      />
      {tab === 'mutual' ? <MutualList /> : tab === 'incoming' ? <IncomingList /> : <SavedList />}
    </Screen>
  );
}
