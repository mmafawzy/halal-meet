import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';

import { useT } from '../../i18n';
import { colors, MAX_CONTENT_WIDTH, spacing } from '../../theme';
import { IconButton } from './Button';
import { StarPattern } from './StarPattern';
import { Text } from './Text';

export interface ScreenProps {
  children: ReactNode;
  /** Wrap content in a ScrollView (default true). */
  scroll?: boolean;
  /** Faint 8-point-star background texture. */
  pattern?: boolean;
  padded?: boolean;
  edges?: Edge[];
  /** Sticky area at the bottom (CTAs). */
  footer?: ReactNode;
  header?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  bg?: string;
  keyboard?: boolean;
  testID?: string;
}

/** Base screen: ivory background, safe areas, centred max-width column (nice on web), optional footer. */
export function Screen({
  children,
  scroll = true,
  pattern = false,
  padded = true,
  edges = ['top', 'bottom'],
  footer,
  header,
  contentStyle,
  bg = colors.bg,
  keyboard = false,
  testID,
}: ScreenProps) {
  const inner = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.column, padded && styles.padded, { paddingBottom: spacing.xxxl }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.fill, styles.column, padded && styles.padded, contentStyle]}>{children}</View>
  );

  const body = (
    <>
      {header}
      {inner}
      {footer ? <View style={[styles.footer, styles.column]}>{footer}</View> : null}
    </>
  );

  return (
    <SafeAreaView testID={testID} edges={edges} style={[styles.fill, { backgroundColor: bg }]}>
      {pattern ? <StarPattern /> : null}
      {keyboard ? (
        <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {body}
        </KeyboardAvoidingView>
      ) : (
        body
      )}
    </SafeAreaView>
  );
}

/** Simple top bar: back button (mirrored in RTL), title, optional trailing actions. */
export function Header({
  title,
  onBack,
  back = true,
  right,
  subtitle,
}: {
  title?: string;
  subtitle?: string;
  onBack?: () => void;
  back?: boolean;
  right?: ReactNode;
}) {
  const t = useT();
  return (
    <View style={[styles.header, styles.column]}>
      <View style={styles.headerSide}>
        {back ? (
          <IconButton
            name="chevron-back"
            directional
            accessibilityLabel={t('common.actions.back')}
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace('/')))}
          />
        ) : null}
      </View>
      <View style={styles.headerTitle}>
        {title ? (
          <Text variant="subheading" center numberOfLines={1}>
            {title}
          </Text>
        ) : null}
        {subtitle ? (
          <Text variant="caption" color={colors.textMuted} center numberOfLines={1}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      <View style={[styles.headerSide, styles.headerRight]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
  padded: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  footer: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.md, gap: spacing.sm },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.sm, minHeight: 52 },
  headerSide: { minWidth: 48, flexDirection: 'row', alignItems: 'center' },
  headerRight: { justifyContent: 'flex-end' },
  headerTitle: { flex: 1, alignItems: 'center' },
});
