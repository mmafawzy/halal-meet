import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../i18n';
import { useUi } from '../../state/ui';
import { colors, MAX_CONTENT_WIDTH, palette, radii, spacing } from '../../theme';
import { Icon } from '../ui/Icon';
import { Text } from '../ui/Text';

/** Global toast (e.g. the 3-second "Undo" after Not for me / swipe). */
export function ToastHost() {
  const toast = useUi((s) => s.toast);
  const dismiss = useUi((s) => s.dismissToast);
  const insets = useSafeAreaInsets();
  const t = useT();

  useEffect(() => {
    if (!toast) return;
    const id = toast.id;
    const timer = setTimeout(() => dismiss(id), toast.durationMs);
    return () => clearTimeout(timer);
  }, [toast, dismiss]);

  if (!toast) return null;
  const icon = toast.tone === 'success' ? 'checkmark-circle' : toast.tone === 'danger' ? 'alert-circle' : 'information-circle';
  const iconColor = toast.tone === 'success' ? palette.emerald100 : toast.tone === 'danger' ? '#F3B6C3' : palette.gold300;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 72, pointerEvents: 'box-none' }]}>
      <Animated.View key={toast.id} entering={FadeInDown.duration(180)} exiting={FadeOutDown.duration(150)} style={styles.toast}>
        <Icon name={icon} size={18} color={iconColor} />
        <Text variant="small" color={palette.ivory50} style={{ flex: 1 }} numberOfLines={2}>
          {toast.message}
        </Text>
        {toast.actionLabel ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => {
              toast.onAction?.();
              dismiss(toast.id, true);
            }}
            hitSlop={8}
          >
            <Text variant="small" weight="bold" color={palette.gold300}>
              {toast.actionLabel}
            </Text>
          </Pressable>
        ) : (
          <Pressable accessibilityLabel={t('common.actions.close')} onPress={() => dismiss(toast.id)} hitSlop={8}>
            <Icon name="close" size={16} color={palette.navy300} />
          </Pressable>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', start: 0, end: 0, alignItems: 'center', paddingHorizontal: spacing.lg },
  toast: {
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH - 32,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.navy,
    borderRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    shadowColor: palette.navy900,
    shadowOpacity: 0.25,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
