import { DEFAULT_QUALITY_FLOOR, type Dimension, type DimensionScore, type ProfileCard } from '@halal-meet/core';
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { Button, Card, CompatRing, Icon, ScoreBar, Tag, Text } from '@/components/ui';
import { useLocale, useT, useTs, useViewerGender } from '@/i18n';
import { renderDiscussSafe, renderReason } from '@/lib/compat';
import { useUi } from '@/state/ui';
import { colors, palette, radii, spacing } from '@/theme';

const DIM_ORDER: Dimension[] = ['religion', 'family', 'children', 'lifestyle', 'finance', 'career', 'timeline', 'location', 'language'];

async function copyToClipboard(text: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  try {
    const nav = (globalThis as { navigator?: { clipboard?: { writeText?: (s: string) => Promise<void> } } }).navigator;
    if (!nav?.clipboard?.writeText) return false;
    await nav.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Screen 23 — "Why we match": overall ring, dimension bars that expand into plain-language reasons,
 * ⚠ Discuss flags with an opening question, Compatibility Reveal hooks and the Free-plan unlock CTA.
 */
export function WhyWeMatch({ card }: { card: ProfileCard }) {
  const t = useT();
  const ts = useTs();
  const locale = useLocale();
  const gender = useViewerGender();
  const showToast = useUi((s) => s.showToast);
  const [open, setOpen] = useState<Dimension | null>(null);
  const c = card.compatibility;

  const dims = DIM_ORDER.map((d) => [d, c.dims[d]] as const).filter((x): x is readonly [Dimension, DimensionScore] => !!x[1]);
  const revealed = dims.filter(([, s]) => s.revealed);
  const locked = dims.filter(([, s]) => !s.revealed && s.toReveal > 0);
  const low = c.displayPct < DEFAULT_QUALITY_FLOOR;

  return (
    <View style={{ gap: spacing.md }} testID="why-we-match">
      <Card style={{ gap: spacing.lg }}>
        <View style={styles.headRow}>
          <CompatRing pct={c.displayPct} size={88} stroke={7} />
          <View style={{ flex: 1, gap: 4 }}>
            <Text variant="heading">{t('profile.why.title')}</Text>
            <Text variant="bodyStrong" color={colors.primary}>
              {t('profile.why.overall', { pct: c.displayPct })}
            </Text>
            {low ? <Tag label={ts('profile.why.low', card.gender)} tone="amber" style={{ alignSelf: 'flex-start' }} /> : null}
          </View>
        </View>
        <Text variant="small" color={colors.textMuted}>
          {t('profile.why.overallHint')}
        </Text>

        {c.reasons.length > 0 ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="overline" color={colors.textMuted}>
              {t('profile.why.expanding')}
            </Text>
            {c.reasons.map((r, i) => (
              <View key={`${r.questionKey}-${i}`} style={styles.reason}>
                <Icon name="checkmark-circle" size={18} color={colors.primary} />
                <Text variant="body" style={{ flex: 1 }}>
                  {renderReason(r, locale, gender)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}

        {revealed.length > 0 || locked.length > 0 ? (
          <View style={{ gap: spacing.md }}>
            <Text variant="overline" color={colors.textMuted}>
              {t('profile.why.dims')}
            </Text>
            {revealed.map(([d, s]) => {
              const reasons = c.reasons.filter((r) => r.dimension === d);
              const discuss = c.discuss.some((f) => f.dimension === d);
              const expanded = open === d;
              return (
                <Pressable
                  key={d}
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={() => setOpen(expanded ? null : d)}
                  style={{ gap: 6 }}
                  testID={`why-dim-${d}`}
                >
                  <View style={styles.dimHead}>
                    <Text variant="bodyStrong" style={{ flex: 1 }}>
                      {t(`common.dimension.${d}`)}
                    </Text>
                    {discuss ? <Icon name="alert-circle" size={14} color={colors.discuss} /> : null}
                    <Text variant="small" weight="semibold" fontLocale="en" color={colors.textMuted}>
                      {Math.round(s.score * 100)}%
                    </Text>
                    {reasons.length > 0 ? <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={16} color={colors.textSubtle} /> : null}
                  </View>
                  <ScoreBar value={s.score} color={s.score >= 0.6 ? colors.primary : colors.discuss} />
                  {expanded
                    ? reasons.map((r, i) => (
                        <View key={i} style={[styles.reason, { paddingStart: spacing.xs }]}>
                          <Icon name="checkmark" size={14} color={colors.primary} />
                          <Text variant="small" color={colors.textMuted} style={{ flex: 1 }}>
                            {renderReason(r, locale, gender)}
                          </Text>
                        </View>
                      ))
                    : null}
                </Pressable>
              );
            })}
            {locked.map(([d, s]) => (
              <Pressable
                key={d}
                accessibilityRole="button"
                onPress={() => router.push('/settings/questions')}
                style={styles.locked}
                testID={`why-reveal-${d}`}
              >
                <View style={styles.lockIcon}>
                  <Icon name="lock-closed" size={14} color={palette.navy500} />
                </View>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="small" weight="semibold">
                    {t('profile.why.locked', { n: s.toReveal, dimension: t(`common.dimension.${d}`) })}
                  </Text>
                  <Text variant="caption" color={colors.textMuted}>
                    {t('profile.why.lockedBody')}
                  </Text>
                </View>
                <Icon name="chevron-forward" directional size={16} color={colors.textSubtle} />
              </Pressable>
            ))}
          </View>
        ) : null}
      </Card>

      {c.discuss.length > 0 ? (
        <Card tone="discuss" style={{ gap: spacing.md }}>
          <View style={{ gap: 4 }}>
            <Text variant="subheading">{t('profile.why.discussTitle')}</Text>
            <Text variant="small" color={colors.textMuted}>
              {t('profile.why.discussBody')}
            </Text>
          </View>
          {c.discuss.map((f) => {
            const d = renderDiscussSafe(f, locale, gender);
            return (
              <View key={f.questionKey} style={styles.discuss}>
                <Text variant="bodyStrong">{d.title}</Text>
                {d.suggestion ? (
                  <>
                    <Text variant="caption" color={colors.textMuted}>
                      {t('profile.why.discussAsk')}
                    </Text>
                    <Text variant="body" style={{ fontStyle: 'italic' }}>
                      “{d.suggestion}”
                    </Text>
                    {Platform.OS === 'web' ? (
                      <Button
                        label={t('profile.why.discussCopy')}
                        icon="copy-outline"
                        variant="ghost"
                        size="sm"
                        style={{ alignSelf: 'flex-start', paddingHorizontal: 0 }}
                        onPress={async () => {
                          if (await copyToClipboard(d.suggestion)) showToast({ message: t('profile.why.copied'), tone: 'success', durationMs: 1800 });
                        }}
                      />
                    ) : null}
                  </>
                ) : null}
              </View>
            );
          })}
        </Card>
      ) : null}

      {c.truncated ? (
        <Card tone="premium" style={{ gap: spacing.sm }}>
          <View style={styles.reason}>
            <Icon name="sparkles" size={18} color={palette.gold500} />
            <Text variant="subheading" style={{ flex: 1 }}>
              {t('profile.why.truncated.title')}
            </Text>
          </View>
          <Text variant="small" color={colors.textMuted}>
            {t('profile.why.truncated.body')}
          </Text>
          <Button
            label={t('profile.why.truncated.cta')}
            variant="gold"
            size="sm"
            style={{ alignSelf: 'flex-start', marginTop: spacing.xs }}
            onPress={() => router.push({ pathname: '/paywall', params: { trigger: 'report' } })}
            testID="why-unlock"
          />
        </Card>
      ) : null}

      <Text variant="caption" color={colors.textSubtle} center>
        {t('profile.why.honest')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  reason: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  dimHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.bgMuted,
  },
  lockIcon: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.sand200, alignItems: 'center', justifyContent: 'center' },
  discuss: { gap: 4, padding: spacing.md, borderRadius: radii.md, backgroundColor: 'rgba(255,255,255,0.7)' },
});
