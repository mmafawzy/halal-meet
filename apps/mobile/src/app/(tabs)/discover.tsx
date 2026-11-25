import type { Dimension, FeedSlot, ProfileCard } from '@halal-meet/core';
import { FlashList } from '@shopify/flash-list';
import { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useFeed, useTopPicks } from '@/api/hooks';
import { EndOfPool } from '@/components/discover/EndOfPool';
import { FeedCard } from '@/components/discover/FeedCard';
import { FeedHeader } from '@/components/discover/FeedHeader';
import { BroaderDivider, DailyQuestionCard, MindfulCard, RevealCard, UpsellCard } from '@/components/discover/InlineCards';
import { InterestCounter } from '@/components/discover/InterestCounter';
import { useInterestFlow } from '@/components/interest/useInterestFlow';
import { ErrorState, LoadingState, Screen } from '@/components/ui';
import { useUi } from '@/state/ui';
import { colors, MAX_CONTENT_WIDTH, spacing } from '@/theme';

type Row =
  | { kind: 'profile'; key: string; card: ProfileCard; slot: FeedSlot }
  | { kind: 'divider'; key: string }
  | { kind: 'question'; key: string }
  | { kind: 'reveal'; key: string; dimension: Dimension; n: number }
  | { kind: 'upsell'; key: string }
  | { kind: 'mindful'; key: string };

/**
 * Screen 21 — Discover: infinite, compatibility-ranked feed (cursor pages, prefetched ~1.5 screens
 * ahead) with Top Picks / greeting / banner pinned in the header, inline cards, the broader-matches
 * divider and the end-of-pool Passport suggestion.
 */
export default function DiscoverScreen() {
  const feed = useFeed();
  const topPicks = useTopPicks();
  const hidden = useUi((s) => s.hiddenIds);
  const [broaderOpen, setBroaderOpen] = useState(false);
  const [upsellDismissed, setUpsellDismissed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const flow = useInterestFlow({ optimisticHide: true });

  const pages = feed.data?.pages ?? [];
  const first = pages[0];
  const last = pages[pages.length - 1];

  const { rows, blockedByDivider } = useMemo(() => {
    const out: Row[] = [];
    const seen = new Set<string>();
    let stop = false;
    let upsellShown = false;
    pages.forEach((p, pi) => {
      p.items.forEach((it, ii) => {
        if (stop) return;
        if (it.type === 'profile') {
          const key = `p:${it.card.id}`;
          if (seen.has(key) || hidden[it.card.id]) return;
          seen.add(key);
          out.push({ kind: 'profile', key, card: it.card, slot: it.slot });
        } else if (it.type === 'divider') {
          if (seen.has('divider')) return;
          seen.add('divider');
          out.push({ kind: 'divider', key: 'divider' });
          if (!broaderOpen) stop = true;
        } else if (it.kind === 'daily_question') {
          out.push({ kind: 'question', key: `q:${pi}:${ii}` });
        } else if (it.kind === 'reveal') {
          out.push({ kind: 'reveal', key: `r:${pi}:${ii}`, dimension: it.dimension, n: it.questionsNeeded });
        } else if (it.kind === 'upsell') {
          if (upsellDismissed || upsellShown) return;
          upsellShown = true;
          out.push({ kind: 'upsell', key: `u:${pi}:${ii}` });
        } else if (it.kind === 'mindful_browsing') {
          out.push({ kind: 'mindful', key: `m:${pi}:${ii}` });
        }
      });
    });
    return { rows: out, blockedByDivider: stop };
  }, [pages, hidden, broaderOpen, upsellDismissed]);

  const canLoadMore = !!feed.hasNextPage && !blockedByDivider;
  const endOfPool = !!last?.endOfPool && !blockedByDivider;

  const loadMore = () => {
    if (canLoadMore && !feed.isFetchingNextPage) void feed.fetchNextPage();
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([feed.refetch(), topPicks.refetch()]);
    } finally {
      setRefreshing(false);
    }
  };

  const renderItem = ({ item }: { item: Row }) => {
    switch (item.kind) {
      case 'profile':
        return <FeedCard card={item.card} slot={item.slot} onInterested={(c) => flow.interested(c)} onNotForMe={flow.notForMe} />;
      case 'divider':
        return <BroaderDivider open={broaderOpen} onContinue={() => setBroaderOpen(true)} />;
      case 'question':
        return <DailyQuestionCard />;
      case 'reveal':
        return <RevealCard dimension={item.dimension} n={item.n} />;
      case 'upsell':
        return <UpsellCard onDismiss={() => setUpsellDismissed(true)} />;
      case 'mindful':
        return <MindfulCard />;
    }
  };

  const header = <FeedHeader scope={first?.scope ?? null} newSince={first?.newSinceLastVisit ?? 0} />;

  return (
    <Screen edges={['top']} scroll={false} padded={false} pattern testID="discover-screen">
      <View style={styles.column}>
        {feed.isLoading ? (
          <View style={styles.pad}>
            {header}
            <LoadingState />
          </View>
        ) : feed.isError ? (
          <View style={styles.pad}>
            {header}
            <ErrorState onRetry={() => void feed.refetch()} />
          </View>
        ) : (
          <FlashList
            testID="discover-feed"
            data={rows}
            renderItem={renderItem}
            keyExtractor={(r) => r.key}
            getItemType={(r) => r.kind}
            extraData={broaderOpen}
            ListHeaderComponent={header}
            ListFooterComponent={
              canLoadMore ? (
                <View style={styles.loader}>
                  <ActivityIndicator color={colors.primary} />
                </View>
              ) : endOfPool ? (
                <EndOfPool suggestions={last?.passportSuggestions ?? []} />
              ) : null
            }
            onEndReached={loadMore}
            onEndReachedThreshold={1.5}
            drawDistance={800}
            refreshing={refreshing}
            onRefresh={() => void refresh()}
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
          />
        )}
      </View>
      <InterestCounter />
      {flow.sheets}
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  pad: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  content: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: 88 },
  loader: { paddingVertical: spacing.xl, alignItems: 'center' },
});
