import type { JourneyStage } from '@halal-meet/core';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { Tag, Text } from '@/components/ui';
import { useT } from '@/i18n';
import { relativeTime } from '@/lib/format';
import { colors, palette } from '@/theme';

/** "Stage 2 · Values" journey chip. */
export function StageChip({ stage, style, muted }: { stage: JourneyStage; style?: StyleProp<ViewStyle>; muted?: boolean }) {
  const t = useT();
  return (
    <Tag
      icon="trail-sign-outline"
      tone={muted ? 'neutral' : 'primary'}
      label={t('matches.stageChip', { n: stage, name: t(`common.stage.${stage}`) })}
      style={style}
    />
  );
}

/** Returns a compact localized "5m / 2h / 3d" label for an ISO timestamp. */
export function useRelativeTime(): (iso: string) => string {
  const t = useT();
  return (iso: string) => {
    const r = relativeTime(iso);
    return t(`common.time.${r.key}`, { n: r.n });
  };
}

/** Small topic-coverage ring (e.g. 8 of 14) — the number sits in the middle. */
export function TopicRing({ covered, total, size = 36, color = colors.primary }: { covered: number; total: number; size?: number; color?: string }) {
  const stroke = 3.5;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.max(0, Math.min(1, covered / total)) : 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={palette.emerald100} strokeWidth={stroke} fill="none" />
        {frac > 0 ? (
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${c * frac} ${c}`}
            strokeLinecap="round"
          />
        ) : null}
      </Svg>
      <View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, alignItems: 'center', justifyContent: 'center' }}>
        <Text fontLocale="en" weight="bold" color={colors.text} style={{ fontSize: size * 0.32, lineHeight: size * 0.4 }}>
          {covered}
        </Text>
      </View>
    </View>
  );
}
