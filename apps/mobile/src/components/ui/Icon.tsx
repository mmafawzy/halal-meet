import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle } from 'react-native';

import { useIsRTL } from '../../i18n';
import { colors } from '../../theme';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  /** Mirror in RTL (back/forward arrows, chevrons, send, progress). */
  directional?: boolean;
  style?: StyleProp<TextStyle>;
}

export function Icon({ name, size = 20, color = colors.text, directional, style }: IconProps) {
  const rtl = useIsRTL();
  return (
    <Ionicons
      name={name}
      size={size}
      color={color}
      style={[directional && rtl ? { transform: [{ scaleX: -1 }] } : null, style]}
    />
  );
}
