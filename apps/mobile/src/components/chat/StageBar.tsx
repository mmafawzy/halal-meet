import type { JourneyStage, MatchSummary } from '@halal-meet/core';
import { Pressable, StyleSheet, View } from 'react-native';

import { useStageReady } from '@/api/hooks';
import { Button, Icon, Sheet, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, MAX_CONTENT_WIDTH, palette, radii, spacing } from '@/theme';

import { GuardianApprovalBanner } from './GuardianPresence';

const STAGES: JourneyStage[] = [1, 2, 3, 4, 5, 6];

/** "Stage 2 of 6 · Values" + 6-segment bar + "Topics covered 8 of 15 [View]". Tapping opens the journey sheet. */
export function StageBar({ match, onOpen, onTopics }: { match: MatchSummary; onOpen: () => void; onTopics: () => void }) {
  const t = useT();
  const closed = match.status === 'closed';
  const tint = closed ? palette.navy300 : colors.primary;
  return (
    <View style={styles.wrap}>
      <Pressable
        testID="chat-stage-bar"
        accessibilityRole="button"
        accessibilityLabel={t('chat.stage.open')}
        onPress={onOpen}
        style={({ pressed }) => [styles.stageRow, pressed && { opacity: 0.7 }]}
      >
        <Icon name="trail-sign-outline" size={15} color={tint} />
        <Text variant="caption" weight="semibold" color={colors.text} style={{ flex: 1 }} numberOfLines={1}>
          {t('common.stageOf', { n: match.stage, name: t(`common.stage.${match.stage}`) })}
        </Text>
        <View style={styles.segments}>
          {STAGES.map((s) => (
            <View key={s} style={[styles.segment, { backgroundColor: s <= match.stage ? tint : palette.sand300 }]} />
          ))}
        </View>
      </Pressable>
      <View style={styles.topicsRow}>
        <Text variant="caption" color={colors.textMuted} style={{ flex: 1 }}>
          {t('chat.stage.topicsCovered', { n: match.topicsCovered, total: match.topicsTotal })}
        </Text>
        <Pressable testID="chat-stage-view-topics" accessibilityRole="button" onPress={onTopics} hitSlop={8}>
          <Text variant="caption" weight="semibold" color={colors.primary}>
            {t('chat.stage.view')}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Journey stages sheet: all six stages with the current one highlighted and the mutual "Ready for next stage" tap. */
export function JourneySheet({ visible, onClose, match }: { visible: boolean; onClose: () => void; match: MatchSummary }) {
  const t = useT();
  const ready = useStageReady(match.matchId);
  const showToast = useUi((s) => s.showToast);
  const next = match.stage < 6 ? ((match.stage + 1) as JourneyStage) : null;
  const active = match.status === 'active';
  // Both tapped ready, but a guardian approval is still missing: show the calm waiting banner instead.
  const awaiting = active && next !== null && match.pendingGuardianApproval?.stage === next;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={t('chat.stage.sheetTitle')}
      subtitle={t('chat.stage.sheetBody')}
      testID="chat-journey-sheet"
      footer={
        active ? (
          awaiting ? (
            <GuardianApprovalBanner match={match} compact />
          ) : next ? (
            <View style={{ gap: spacing.xs }}>
              <Button
                testID="chat-stage-ready"
                label={t('chat.stage.ready', { n: next })}
                icon="checkmark-circle-outline"
                fullWidth
                loading={ready.isPending}
                onPress={() =>
                  ready.mutate(next, {
                    onSuccess: () => {
                      showToast({ message: t('chat.stage.readySent'), tone: 'success', durationMs: 3000 });
                      onClose();
                    },
                    onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
                  })
                }
              />
              <Text variant="caption" color={colors.textSubtle} center>
                {t('chat.stage.readyHint')}
              </Text>
            </View>
          ) : (
            <Text variant="small" color={colors.primary} center>
              {t('chat.stage.final')}
            </Text>
          )
        ) : null
      }
    >
      <View style={{ gap: spacing.sm }}>
        {STAGES.map((s) => {
          const done = s < match.stage;
          const current = s === match.stage;
          return (
            <View key={s} style={[styles.stageItem, current && styles.stageItemCurrent]}>
              <View style={[styles.dot, done && { backgroundColor: colors.primary }, current && styles.dotCurrent]}>
                {done ? (
                  <Icon name="checkmark" size={14} color={palette.white} />
                ) : (
                  <Text variant="caption" fontLocale="en" weight="bold" color={current ? colors.primary : colors.textSubtle}>
                    {s}
                  </Text>
                )}
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text variant="bodyStrong" color={s > match.stage ? colors.textMuted : colors.text}>
                    {t(`common.stage.${s}`)}
                  </Text>
                  {current ? (
                    <View style={styles.currentPill}>
                      <Text variant="caption" color={colors.primary} style={{ fontSize: 10, lineHeight: 13 }}>
                        {t('chat.stage.current')}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="small" color={colors.textMuted}>
                  {t(`chat.stage.desc.${s}`)}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSoft,
  },
  stageRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  segments: { flexDirection: 'row', gap: 3, width: 96 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  topicsRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingStart: 15 + spacing.sm },
  stageItem: { flexDirection: 'row', gap: spacing.md, padding: spacing.md, borderRadius: radii.lg },
  stageItemCurrent: { backgroundColor: colors.primaryTint },
  dot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: palette.sand200,
  },
  dotCurrent: { backgroundColor: palette.white, borderWidth: 2, borderColor: colors.primary },
  currentPill: { paddingHorizontal: spacing.sm, paddingVertical: 1, borderRadius: radii.pill, backgroundColor: palette.emerald100 },
});
