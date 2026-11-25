import type { GuardianPresence, MatchSummary } from '@halal-meet/core';
import { StyleSheet, View } from 'react-native';

import { api } from '@/api';
import { useGuardians, useSimulateGuardianApproval } from '@/api/hooks';
import { guardianGender } from '@/components/family/shared';
import { Button, Icon, Text } from '@/components/ui';
import { useT, useTs, type TFunction, type TsFunction } from '@/i18n';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

/** What a guardian can do in the conversation, as one sentence key. */
function roleKey(p: GuardianPresence): 'reads' | 'readsAndJoins' | 'joins' | 'involved' {
  if (p.participates) return p.readsConversation ? 'readsAndJoins' : 'joins';
  return p.readsConversation ? 'reads' : 'involved';
}

/**
 * Presence lines from `match.guardians` (spec 01 §44: always visible to both people, never silent):
 * "Sara's father can read this conversation." / "Your father can read this conversation."
 * Arabic: the verb follows the guardian's gender (from the relationship), "your" follows the viewer.
 */
export function presenceLines(match: MatchSummary, t: TFunction, ts: TsFunction): Array<{ key: string; text: string }> {
  const o = match.other;
  const lines: Array<{ key: string; text: string }> = [];
  match.guardians.mine.forEach((p, i) => {
    const who = t(`chat.presence.mineWho.${p.relationship}`);
    lines.push({ key: `mine-${i}`, text: ts(`chat.presence.${roleKey(p)}`, guardianGender(p.relationship), { who }) });
  });
  match.guardians.theirs.forEach((p, i) => {
    const who = ts(`chat.presence.theirsWho.${p.relationship}`, o.gender, { name: o.firstName });
    lines.push({ key: `theirs-${i}`, text: ts(`chat.presence.${roleKey(p)}`, guardianGender(p.relationship), { who }) });
  });
  return lines;
}

/**
 * Calm banner while a stage 5/6 move waits for a guardian's approval (`match.pendingGuardianApproval`).
 * The relationship named for "mine" comes from the member's own approving guardian (GET /guardians).
 * In mock mode a demo button stands in for the guardian approving on their own phone.
 */
export function GuardianApprovalBanner({ match, compact }: { match: MatchSummary; compact?: boolean }) {
  const t = useT();
  const ts = useTs();
  const pending = match.pendingGuardianApproval;
  const guardians = useGuardians(!!pending?.mine).data ?? [];
  const simulate = useSimulateGuardianApproval();
  const showToast = useUi((s) => s.showToast);
  if (!pending || match.status !== 'active') return null;

  const approver = guardians.find((g) => g.accepted && g.status === 'active' && g.permissions.approve_stages);
  const rel = approver?.relationship ?? 'other';
  const relLabel = t(`chat.approval.rel.${rel}`);
  const who = t(`chat.presence.mineWho.${rel}`);

  return (
    <View style={[styles.card, compact && { padding: spacing.md }]} testID="chat-approval-banner" accessibilityRole="summary">
      <View style={styles.head}>
        <Icon name="hourglass-outline" size={18} color={colors.discuss} />
        <Text variant="subheading" style={{ flex: 1 }}>
          {t('chat.approval.title')}
        </Text>
      </View>
      {pending.mine ? (
        <Text variant="small" testID="chat-approval-mine">
          {t(`chat.approval.mine${pending.stage}`, { rel: relLabel, who })}
        </Text>
      ) : null}
      {pending.theirs ? (
        <Text variant="small" testID="chat-approval-theirs">
          {t(`chat.approval.theirs${pending.stage}`)}
        </Text>
      ) : null}
      <Text variant="caption" color={colors.textMuted}>
        {t('chat.approval.hint')}
      </Text>
      {api.dev && pending.mine ? (
        <Button
          label={t('chat.approval.demo')}
          icon="flask-outline"
          variant="outline"
          size="sm"
          style={{ alignSelf: 'flex-start' }}
          loading={simulate.isPending}
          onPress={() =>
            simulate.mutate(match.matchId, {
              onSuccess: () =>
                showToast({
                  message: ts('chat.approval.demoDone', guardianGender(rel), { rel: relLabel, who }),
                  tone: 'success',
                  durationMs: 3000,
                }),
              onError: () => showToast({ message: t('common.states.error'), tone: 'danger' }),
            })
          }
          testID="chat-approval-simulate"
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: palette.amber100,
    backgroundColor: palette.sand100,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
