import { QUESTIONS_BY_KEY, type Message, type ProfileCard } from '@halal-meet/core';
import { StyleSheet, View } from 'react-native';

import { useAnswerTopic } from '@/api/hooks';
import { Button, Chip, ChipRow, Icon, Tag, Text } from '@/components/ui';
import { useLocale, usePick, useT } from '@/i18n';
import { formatTime } from '@/lib/format';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

export interface MessageItemProps {
  message: Message;
  mine: boolean;
  other: ProfileCard;
  closed: boolean;
  riskDismissed: boolean;
  onDismissRisk: () => void;
  onReport: (message: Message) => void;
}

/** One entry in the structured chat: system note, text bubble or topic card, plus the inline safety banner. */
export function MessageItem({ message, mine, other, closed, riskDismissed, onDismissRisk, onReport }: MessageItemProps) {
  if (message.kind === 'system') return <SystemNote body={message.body} />;
  return (
    <View style={{ gap: spacing.xs }}>
      {message.kind === 'topic_card' ? (
        <TopicCard message={message} mine={mine} other={other} closed={closed} />
      ) : (
        <Bubble message={message} mine={mine} />
      )}
      {message.risk && !riskDismissed ? (
        <RiskBanner message={message} mine={mine} onDismiss={onDismissRisk} onReport={() => onReport(message)} />
      ) : null}
    </View>
  );
}

function SystemNote({ body }: { body: string }) {
  return (
    <View style={styles.system}>
      <Icon name="sparkles-outline" size={13} color={palette.gold500} />
      <Text variant="caption" color={colors.textMuted} center style={{ flexShrink: 1 }}>
        {body}
      </Text>
    </View>
  );
}

function Bubble({ message, mine }: { message: Message; mine: boolean }) {
  const locale = useLocale();
  return (
    <View style={[styles.bubbleRow, mine ? { justifyContent: 'flex-end' } : { justifyContent: 'flex-start' }]}>
      <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
        <Text variant="body" color={mine ? palette.white : colors.text}>
          {message.body}
        </Text>
        <Text variant="caption" color={mine ? 'rgba(255,255,255,0.75)' : colors.textSubtle} style={styles.time}>
          {formatTime(message.sentAt, locale)}
        </Text>
      </View>
    </View>
  );
}

/** Topic card: the question, then the viewer's answer; both answers are revealed together once both replied. */
function TopicCard({ message, mine, other, closed }: { message: Message; mine: boolean; other: ProfileCard; closed: boolean }) {
  const t = useT();
  const pickText = usePick();
  const answer = useAnswerTopic(message.matchId);
  const showToast = useUi((s) => s.showToast);
  const q = message.topicKey ? QUESTIONS_BY_KEY[message.topicKey] : undefined;
  const a = message.topicAnswers;
  const labelOf = (v: string | null) => {
    if (!v) return '';
    const opt = q?.options.find((o) => o.value === v);
    return opt ? pickText(opt.label) : v;
  };
  const topicName = q ? pickText(q.topic) : '';
  const same = !!a?.revealed && a.mine === a.theirs;

  return (
    <View style={[styles.cardRow, mine ? { alignItems: 'flex-end' } : { alignItems: 'flex-start' }]}>
      <View testID={`chat-topic-card-${message.topicKey ?? message.id}`} style={styles.card}>
        <View style={styles.cardHead}>
          <Icon name="albums-outline" size={14} color={palette.gold500} />
          <Text variant="overline" color="#8A6A22" style={{ flexShrink: 1 }}>
            {t('chat.card.overline', { topic: topicName })}
          </Text>
        </View>
        <Text variant="bodyStrong">{message.body}</Text>

        {a && !a.mine ? (
          closed ? null : (
            <View style={{ gap: spacing.sm }}>
              <Text variant="caption" color={colors.textMuted}>
                {mine ? t('chat.card.yourView') : t('chat.card.yourAnswer')}
              </Text>
              <ChipRow>
                {(q?.options ?? []).map((o) => (
                  <Chip
                    key={o.value}
                    size="sm"
                    label={pickText(o.label)}
                    disabled={answer.isPending}
                    onPress={() =>
                      answer.mutate(
                        { messageId: message.id, body: { value: o.value } },
                        { onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }) },
                      )
                    }
                  />
                ))}
              </ChipRow>
              <Text variant="caption" color={colors.textSubtle}>
                {t('chat.card.revealHint')}
              </Text>
            </View>
          )
        ) : null}

        {a?.mine && !a.revealed ? (
          <View style={{ gap: spacing.xs }}>
            <AnswerLine label={t('chat.card.you')} value={labelOf(a.mine)} />
            <View style={styles.waiting}>
              <Icon name="hourglass-outline" size={13} color={colors.textMuted} />
              <Text variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
                {t('chat.card.waiting')}
              </Text>
            </View>
          </View>
        ) : null}

        {a?.revealed ? (
          <View style={{ gap: spacing.xs }}>
            <AnswerLine label={t('chat.card.you')} value={labelOf(a.mine)} />
            <AnswerLine label={other.firstName} value={labelOf(a.theirs)} />
            <Tag
              icon={same ? 'checkmark-circle' : 'chatbubbles-outline'}
              tone={same ? 'primary' : 'amber'}
              label={same ? t('chat.card.same') : t('chat.card.different')}
              style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
            />
          </View>
        ) : null}
      </View>
    </View>
  );
}

function AnswerLine({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.answerLine}>
      <Text variant="caption" color={colors.textMuted} style={{ minWidth: 56 }} numberOfLines={1}>
        {label}
      </Text>
      <Text variant="small" weight="semibold" style={{ flex: 1 }}>
        {value}
      </Text>
    </View>
  );
}

/** Inline safety interstitial (screen 38): shown under a message carrying a `risk` warning. */
function RiskBanner({ message, mine, onDismiss, onReport }: { message: Message; mine: boolean; onDismiss: () => void; onReport: () => void }) {
  const t = useT();
  const kind = message.risk!.warning;
  const body = t(`chat.risk.${kind}${mine ? 'Mine' : ''}`);
  return (
    <View testID={`chat-risk-${message.id}`} style={styles.risk}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <Icon name="warning-outline" size={18} color={colors.danger} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="small" weight="semibold" color={colors.danger}>
            {t('chat.risk.title')}
          </Text>
          <Text variant="small" color={colors.text}>
            {body}
            {kind === 'money' ? ` ${t('common.safety.neverSendMoney')}` : ''}
          </Text>
        </View>
      </View>
      <View style={styles.riskActions}>
        {!mine ? <Button label={t('common.actions.report')} variant="danger" size="sm" icon="flag-outline" onPress={onReport} /> : null}
        <Button testID={`chat-risk-ok-${message.id}`} label={t('chat.risk.understand')} variant="outline" size="sm" onPress={onDismiss} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  system: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    maxWidth: '88%',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radii.pill,
    backgroundColor: palette.sand100,
    marginVertical: spacing.xs,
  },
  bubbleRow: { flexDirection: 'row' },
  bubble: { maxWidth: '80%', paddingHorizontal: spacing.md + 2, paddingVertical: spacing.sm + 2, borderRadius: radii.xl, gap: 2 },
  bubbleMine: { backgroundColor: colors.primary, borderBottomEndRadius: 6 },
  bubbleTheirs: { backgroundColor: palette.white, borderWidth: 1, borderColor: colors.borderSoft, borderBottomStartRadius: 6 },
  time: { fontSize: 10, lineHeight: 13, alignSelf: 'flex-end' },
  cardRow: { width: '100%' },
  card: {
    width: '88%',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.xl,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: palette.gold300,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  waiting: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.sm, borderRadius: radii.md, backgroundColor: palette.sand100 },
  answerLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  risk: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.dangerSoft,
    borderWidth: 1,
    borderColor: '#EBC3CC',
  },
  riskActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm, flexWrap: 'wrap' },
});
