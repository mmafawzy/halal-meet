import type { GuardianOpinion, MatchSummary } from '@halal-meet/core';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Avatar, Card, Divider, Icon, SectionTitle, Tag, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { useLocal } from '@/state/local';
import { colors, spacing } from '@/theme';

import { OPINION_TONE } from './shared';

/**
 * "Opinions from your family" (GET /guardians/opinions): what each guardian thought of the member's
 * introductions and on profiles the member shared with them. Private to the member; the other person never sees it.
 */
export function OpinionsSection({ opinions, matches }: { opinions: GuardianOpinion[]; matches: MatchSummary[] }) {
  const t = useT();
  const bySubject = new Map(matches.map((m) => [m.other.id, m]));
  const sharedIds = useLocal((s) => s.sharedWithGuardians);

  return (
    <View testID="family-opinions">
      <SectionTitle title={t('family.opinions.title')} />
      <Card>
        <View style={{ gap: spacing.md }}>
          <Text variant="small" color={colors.textMuted}>
            {t('family.opinions.body')}
          </Text>
          {opinions.length === 0 ? (
            <Text variant="small" color={colors.textSubtle}>
              {t('family.opinions.empty')}
            </Text>
          ) : null}
          {opinions.map((o, i) => {
            const m = bySubject.get(o.subjectId);
            const subjectName = m?.other.firstName;
            const shared = !m && sharedIds.includes(o.subjectId);
            const linked = !!m || shared;
            return (
              <View key={`${o.guardianId}:${o.subjectId}`} testID={`family-opinion-${o.subjectId}`}>
                {i > 0 ? <Divider style={{ marginBottom: spacing.md }} /> : null}
                <Pressable
                  accessibilityRole={linked ? 'button' : undefined}
                  disabled={!linked}
                  onPress={() => linked && router.push({ pathname: '/profile/[id]', params: { id: o.subjectId } })}
                  style={styles.row}
                >
                  <Avatar id={o.subjectId} name={subjectName ?? '?'} photoUrl={m?.other.photoUrl} photoState={m?.other.photoState} size={44} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {subjectName
                        ? t('family.opinions.about', { name: subjectName })
                        : shared
                          ? t('family.opinions.sharedProfile')
                          : t('family.opinions.earlier')}
                    </Text>
                    <View style={styles.tags}>
                      <Tag tone={OPINION_TONE[o.opinion]} label={t(`family.dashboard.opinions.${o.opinion}`)} />
                      <Text variant="caption" color={colors.textMuted}>
                        {t('family.opinions.from', { name: o.guardianName, relationship: t(`family.invite.relationships.${o.relationship}`) })}
                      </Text>
                    </View>
                    {o.note ? (
                      <Text variant="small" color={colors.text} style={{ fontStyle: 'italic' }}>
                        “{o.note}”
                      </Text>
                    ) : null}
                  </View>
                  {linked ? <Icon name="chevron-forward" size={18} color={colors.textSubtle} directional /> : null}
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm },
});
