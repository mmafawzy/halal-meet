import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { useT } from '../../i18n';
import { colors, palette } from '../../theme';
import { Text } from './Text';

/** Emerald compatibility ring with the percentage in the middle. */
export function CompatRing({
  pct,
  size = 64,
  stroke = 6,
  color = colors.primary,
  track = palette.emerald100,
}: {
  pct: number;
  size?: number;
  stroke?: number;
  color?: string;
  track?: string;
}) {
  const t = useT();
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <View style={{ width: size, height: size }} accessibilityLabel={t('common.compatible', { pct: clamped })}>
      <Svg width={size} height={size} style={{ transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${(c * clamped) / 100} ${c}`}
          strokeLinecap="round"
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>
        <Text fontLocale="en" weight="bold" color={colors.text} style={{ fontSize: size * 0.26, lineHeight: size * 0.32 }}>
          {clamped}
          <Text fontLocale="en" weight="semibold" color={colors.textMuted} style={{ fontSize: size * 0.15 }}>
            %
          </Text>
        </Text>
      </View>
    </View>
  );
}

/** Horizontal bar used for dimension scores. */
export function ScoreBar({ value, color = colors.primary, height = 8 }: { value: number; color?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: palette.sand200, overflow: 'hidden' }}>
      <View style={{ width: `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`, height, backgroundColor: color, borderRadius: height / 2 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
