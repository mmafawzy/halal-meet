import { memo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Defs, Path, Pattern, Polygon, Rect } from 'react-native-svg';

import { palette } from '../../theme';

/** Points of an 8-point star (two overlapping squares) centred at (cx, cy). */
export function starPoints(cx: number, cy: number, r: number, inner = 0.414): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    const rad = i % 2 === 0 ? r : r * (1 - inner * 0.55);
    pts.push(`${(cx + rad * Math.cos(angle)).toFixed(2)},${(cy + rad * Math.sin(angle)).toFixed(2)}`);
  }
  return pts.join(' ');
}

interface Props {
  color?: string;
  opacity?: number;
  size?: number;
  style?: StyleProp<ViewStyle>;
}

/**
 * Subtle 8-point geometric star lattice used as a background texture (spec: 3–5% opacity).
 * Rendered absolutely; put it as the first child of a relative container.
 */
export const StarPattern = memo(function StarPattern({ color = palette.navy900, opacity = 0.04, size = 56, style }: Props) {
  const h = size / 2;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }, style]}>
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="hm-star" patternUnits="userSpaceOnUse" width={size} height={size}>
            <Polygon points={starPoints(h, h, h * 0.62)} fill="none" stroke={color} strokeWidth={1} />
            <Path d={`M0 0 L${h * 0.38} 0 M0 0 L0 ${h * 0.38} M${size} ${size} L${size - h * 0.38} ${size} M${size} ${size} L${size} ${size - h * 0.38}`} stroke={color} strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#hm-star)" opacity={opacity} />
      </Svg>
    </View>
  );
});

/** A single decorative star (logo mark, celebration). */
export function Star({ size = 18, color = palette.gold500, filled = true }: { size?: number; color?: string; filled?: boolean }) {
  const h = size / 2;
  return (
    <Svg width={size} height={size}>
      <Polygon
        points={starPoints(h, h, h * 0.96)}
        fill={filled ? color : 'none'}
        stroke={color}
        strokeWidth={filled ? 0 : 1.4}
      />
    </Svg>
  );
}
