import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useT } from '../../i18n';
import { colors, MAX_CONTENT_WIDTH, palette, radii, spacing } from '../../theme';
import { IconButton } from './Button';
import { Text } from './Text';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Max height as a fraction of the screen (default 0.88). */
  maxHeight?: number;
  scroll?: boolean;
  testID?: string;
}

/** Bottom sheet built on RN Modal (works on iOS, Android and web). */
export function Sheet({ visible, onClose, title, subtitle, children, footer, scroll = true, testID }: SheetProps) {
  const insets = useSafeAreaInsets();
  const t = useT();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.flex}>
          <Pressable accessibilityLabel={t('common.actions.close')} style={styles.backdrop} onPress={onClose} />
          <View testID={testID} style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
            <View style={styles.handle} />
            {title || subtitle ? (
              <View style={styles.header}>
                <View style={styles.flex}>
                  {title ? <Text variant="heading">{title}</Text> : null}
                  {subtitle ? (
                    <Text variant="small" color={colors.textMuted} style={{ marginTop: 2 }}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <IconButton name="close" accessibilityLabel={t('common.actions.close')} onPress={onClose} bg={palette.sand100} size={34} />
              </View>
            ) : null}
            {scroll ? (
              <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent} keyboardShouldPersistTaps="handled">
                {children}
              </ScrollView>
            ) : (
              <View style={[styles.body, styles.bodyContent]}>{children}</View>
            )}
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: colors.overlay },
  sheet: {
    marginTop: 'auto',
    width: '100%',
    maxWidth: MAX_CONTENT_WIDTH,
    alignSelf: 'center',
    maxHeight: '90%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radii.xxl,
    borderTopRightRadius: radii.xxl,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: palette.sand300, marginBottom: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, paddingHorizontal: spacing.xl, paddingBottom: spacing.sm },
  body: { flexGrow: 0 },
  bodyContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md, gap: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, gap: spacing.sm },
});
