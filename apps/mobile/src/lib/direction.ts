import { Platform, type ViewStyle } from 'react-native';

/**
 * Forces the layout direction of a container, cross-platform.
 *
 * React Native supports the `direction` style on native (it flips `row`, `start`/`end`, etc.),
 * but react-native-web ignores it and logs "Invalid style property of direction". So on web we
 * set the DOM `dir` attribute instead, which is what react-native-web reads.
 *
 * Used by the onboarding carousel: the scroller is forced LTR so scroll offsets behave the same on
 * every platform, and each slide re-applies the natural direction for its own content.
 */
export function directionProps(dir: 'ltr' | 'rtl'): Record<string, any> {
  return Platform.OS === 'web' ? { dir } : { style: { direction: dir } as ViewStyle };
}
