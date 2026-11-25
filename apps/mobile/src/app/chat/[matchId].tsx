import type { Message, ReportBody } from '@halal-meet/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useMatches, useMe, useMessages, useSendMessage } from '@/api/hooks';
import { CONTACT_STAGE, guidedApplies, looksLikeContact } from '@/components/chat/boundaries';
import { GuidedNotice, ReadyCard, StarterCard, SuggestionCard } from '@/components/chat/ChatCards';
import { ChatHeader } from '@/components/chat/ChatHeader';
import { ChatMenuSheet, type ChatMenuAction } from '@/components/chat/ChatMenuSheet';
import { ClosedFooter, Composer } from '@/components/chat/Composer';
import { EndSheet } from '@/components/chat/EndSheet';
import { GuardianApprovalBanner } from '@/components/chat/GuardianPresence';
import { MessageItem } from '@/components/chat/MessageItem';
import { JourneySheet, StageBar } from '@/components/chat/StageBar';
import { TopicLibrarySheet } from '@/components/chat/TopicLibrarySheet';
import { nextUncoveredTopic, topicStates } from '@/components/chat/topics';
import { BlockSheet, ReportSheet } from '@/components/safety/ReportSheet';
import { Button, EmptyState, ErrorState, Header, LoadingState, Screen } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { MAX_CONTENT_WIDTH, spacing } from '@/theme';

type SheetName = 'menu' | 'journey' | 'topics' | 'end' | 'report' | 'block' | null;

const REPORT_CATEGORY: Record<NonNullable<Message['risk']>['warning'], ReportBody['category']> = {
  money: 'scam',
  off_platform: 'scam',
  explicit: 'inappropriate',
  aggression: 'harassment',
};

/** Screen 35 — structured chat: header, stage bar, messages + topic cards, safety banners, composer, end respectfully. */
export default function ChatScreen() {
  const t = useT();
  const { matchId: rawId } = useLocalSearchParams<{ matchId: string }>();
  const matchId = typeof rawId === 'string' ? rawId : '';
  const matches = useMatches({ poll: true });
  const me = useMe();
  const messagesQ = useMessages(matchId || undefined);
  const send = useSendMessage(matchId);
  const showToast = useUi((s) => s.showToast);

  const [draft, setDraft] = useState('');
  const [sheet, setSheet] = useState<SheetName>(null);
  const [reportMsg, setReportMsg] = useState<Message | null>(null);
  const [riskDismissed, setRiskDismissed] = useState<Set<string>>(() => new Set());
  const [suggestDismissed, setSuggestDismissed] = useState<Set<string>>(() => new Set());
  const [readyDismissed, setReadyDismissed] = useState(false);
  const [guidedDismissed, setGuidedDismissed] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const match = matches.data?.find((m) => m.matchId === matchId);
  const messages = messagesQ.data ?? [];
  const states = useMemo(() => topicStates(messages), [messages]);

  // Keep the newest message in view as messages arrive (polling every 2 s).
  const count = messages.length;
  useEffect(() => {
    const id = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: count > 0 }), 60);
    return () => clearTimeout(id);
  }, [count]);

  if (matches.isLoading || (messagesQ.isLoading && !!match)) {
    return (
      <Screen header={<Header />}>
        <LoadingState />
      </Screen>
    );
  }
  if (matches.isError) {
    return (
      <Screen header={<Header />}>
        <ErrorState onRetry={() => void matches.refetch()} />
      </Screen>
    );
  }
  if (!match) {
    return (
      <Screen header={<Header />} testID="chat-not-found">
        <EmptyState
          icon="chatbubbles-outline"
          title={t('chat.notFound')}
          action={<Button label={t('chat.end.back')} variant="secondary" onPress={() => router.replace('/(tabs)/conversations')} />}
        />
      </Screen>
    );
  }

  const other = match.other;
  const active = match.status === 'active';
  const guided = guidedApplies(me.data?.profile?.halalMode, other.halalMode) && match.stage < CONTACT_STAGE;
  const boundaryHint = guided && looksLikeContact(draft) ? t('chat.guided.contactBlocked') : null;
  const conversational = messages.filter((m) => m.kind !== 'system');
  const suggestion = nextUncoveredTopic(states);
  const showSuggestion = active && conversational.length >= 4 && !!suggestion && !suggestDismissed.has(suggestion);
  const awaitingFamily = active && !!match.pendingGuardianApproval;
  const showReady = active && !awaitingFamily && !readyDismissed && (match.topicsCovered >= 12 || match.stage >= 5);

  const sendText = () => {
    const body = draft.trim();
    if (!body || boundaryHint) return;
    send.mutate(
      { kind: 'text', body },
      {
        onSuccess: () => setDraft(''),
        onError: () => showToast({ message: t('chat.composer.error'), tone: 'danger' }),
      },
    );
  };

  const sendTopic = (topicKey: string) => {
    send.mutate(
      { kind: 'topic_card', topicKey },
      {
        onSuccess: () => {
          setSheet(null);
          showToast({ message: t('chat.topics.sent'), tone: 'success', durationMs: 2200 });
        },
        onError: () => showToast({ message: t('chat.composer.error'), tone: 'danger' }),
      },
    );
  };

  const onMenu = (a: ChatMenuAction) => {
    if (a === 'report') setReportMsg(null);
    setSheet(a);
  };

  const leave = () => router.replace('/(tabs)/conversations');

  return (
    <Screen
      scroll={false}
      padded={false}
      keyboard
      testID="chat-screen"
      header={
        <>
          <ChatHeader match={match} onMore={() => setSheet('menu')} />
          <StageBar match={match} onOpen={() => setSheet('journey')} onTopics={() => setSheet('topics')} />
        </>
      }
    >
      <ScrollView
        ref={scrollRef}
        style={styles.flex}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
        testID="chat-messages"
      >
        {guided && !guidedDismissed ? <GuidedNotice onDismiss={() => setGuidedDismissed(true)} /> : null}
        {messages.map((m) => (
          <MessageItem
            key={m.id}
            message={m}
            mine={m.senderId !== null && m.senderId !== other.id}
            other={other}
            closed={!active}
            riskDismissed={riskDismissed.has(m.id)}
            onDismissRisk={() => setRiskDismissed((s) => new Set(s).add(m.id))}
            onReport={(msg) => {
              setReportMsg(msg);
              setSheet('report');
            }}
          />
        ))}
        {active && conversational.length === 0 ? <StarterCard other={other} onPick={setDraft} /> : null}
        {showSuggestion && suggestion ? (
          <SuggestionCard
            topicKey={suggestion}
            other={other}
            sending={send.isPending}
            onSend={() => sendTopic(suggestion)}
            onDismiss={() => setSuggestDismissed((s) => new Set(s).add(suggestion))}
          />
        ) : null}
        {awaitingFamily ? <GuardianApprovalBanner match={match} /> : null}
        {showReady ? (
          <ReadyCard
            onContinue={() => setReadyDismissed(true)}
            onFamily={() => router.push('/(tabs)/family')}
            onEnd={() => setSheet('end')}
          />
        ) : null}
      </ScrollView>

      {active ? (
        <Composer
          value={draft}
          onChange={setDraft}
          onSend={sendText}
          onTopics={() => setSheet('topics')}
          sending={send.isPending}
          boundaryHint={boundaryHint}
        />
      ) : (
        <ClosedFooter />
      )}

      <ChatMenuSheet visible={sheet === 'menu'} onClose={() => setSheet(null)} match={match} onAction={onMenu} />
      <JourneySheet visible={sheet === 'journey'} onClose={() => setSheet(null)} match={match} />
      <TopicLibrarySheet
        visible={sheet === 'topics'}
        onClose={() => setSheet(null)}
        states={states}
        otherGender={other.gender}
        canSend={active && !send.isPending}
        onSend={sendTopic}
      />
      <EndSheet visible={sheet === 'end'} onClose={() => setSheet(null)} matchId={match.matchId} other={other} />
      <ReportSheet
        key={reportMsg?.id ?? 'menu'}
        visible={sheet === 'report'}
        onClose={() => setSheet(null)}
        subjectId={other.id}
        subjectName={other.firstName}
        subjectGender={other.gender}
        messageIds={reportMsg ? [reportMsg.id] : undefined}
        defaultCategory={reportMsg?.risk ? REPORT_CATEGORY[reportMsg.risk.warning] : undefined}
        onDone={(blocked) => {
          if (reportMsg) setRiskDismissed((s) => new Set(s).add(reportMsg.id));
          if (blocked) leave();
        }}
      />
      <BlockSheet
        visible={sheet === 'block'}
        onClose={() => setSheet(null)}
        subjectId={other.id}
        subjectName={other.firstName}
        subjectGender={other.gender}
        onDone={leave}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center', padding: spacing.lg, gap: spacing.md },
});
