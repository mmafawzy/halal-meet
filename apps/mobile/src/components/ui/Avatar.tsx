import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

import { hashString } from '../../api/mock/rng';
import { initials } from '../../lib/format';
import { avatarGradients, palette } from '../../theme';
import { Icon } from './Icon';
import { starPoints } from './StarPattern';
import { Text } from './Text';

export type AvatarLock = 'none' | 'request' | 'family';

export interface AvatarProps {
  id: string;
  name: string;
  photoUrl?: string | null;
  /** visible / blurred (request to view) / locked (family only). */
  photoState?: 'visible' | 'blurred' | 'locked';
  size?: number;
  /** Rounded square instead of circle (large card hero). */
  shape?: 'circle' | 'rounded';
  style?: StyleProp<ViewStyle>;
  ring?: string;
}

/**
 * Photo avatar. When there is no photo (or it is blurred / locked) renders tasteful initials on a soft
 * gradient with a faint star motif, plus a lock badge for "request" / "family" states.
 */
export function Avatar({ id, name, photoUrl, photoState = 'visible', size = 56, shape = 'circle', style, ring }: AvatarProps) {
  const radius = shape === 'circle' ? size / 2 : Math.min(28, size * 0.14);
  const lock: AvatarLock = photoState === 'blurred' ? 'request' : photoState === 'locked' ? 'family' : 'none';
  const showPhoto = !!photoUrl && photoState !== 'locked';
  const [c1, c2] = avatarGradients[hashString(id) % avatarGradients.length]!;
  const badge = Math.max(18, Math.round(size * 0.26));

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: radius },
        ring ? { borderWidth: 2, borderColor: ring } : null,
        style,
      ]}
      accessibilityLabel={name}
    >
      <View style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: 'hidden' }]}>
        {showPhoto ? (
          <Image
            source={{ uri: photoUrl! }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            blurRadius={photoState === 'blurred' ? 30 : 0}
            transition={200}
          />
        ) : (
          <LinearGradient colors={[c1, c2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[StyleSheet.absoluteFill, styles.center]}>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
              <Polygon points={starPoints(size * 0.82, size * 0.2, size * 0.42)} fill="none" stroke={palette.white} strokeOpacity={0.55} strokeWidth={1} />
              <Polygon points={starPoints(size * 0.12, size * 0.92, size * 0.3)} fill="none" stroke={palette.white} strokeOpacity={0.4} strokeWidth={1} />
            </Svg>
            <Text
              fontLocale={/[؀-ۿ]/.test(name) ? 'ar' : 'en'}
              weight="semibold"
              color={palette.navy700}
              style={{ fontSize: size * 0.36, lineHeight: size * 0.5 }}
            >
              {initials(name)}
            </Text>
          </LinearGradient>
        )}
      </View>
      {lock !== 'none' ? (
        <View
          style={[
            styles.lock,
            {
              width: badge,
              height: badge,
              borderRadius: badge / 2,
              end: shape === 'circle' ? -2 : 8,
              bottom: shape === 'circle' ? -2 : 8,
            },
          ]}
        >
          <Icon name={lock === 'family' ? 'people' : 'lock-closed'} size={badge * 0.55} color={palette.ivory50} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
  lock: {
    position: 'absolute',
    backgroundColor: palette.navy900,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: palette.ivory50,
  },
});
