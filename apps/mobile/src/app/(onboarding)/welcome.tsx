import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { HalalModeLevels, WelcomePoints, WhyWeMatchSample } from '@/components/onboarding/WelcomeVisuals';
import { Button, Field, IconButton, Screen, Sheet, Text, TextField, Wordmark } from '@/components/ui';
import { useIsRTL, useT } from '@/i18n';
import { directionProps } from '@/lib/direction';
import { useSession } from '@/state/session';
import { colors, palette, spacing } from '@/theme';
import { GUARDIAN_HOME } from '@/components/family/shared';

const COUNT = 3;

/**
 * Screen 3 — welcome carousel. A horizontal paging ScrollView whose page index is derived from the
 * scroll offset and the measured width (works on web too).
 *
 * RTL: scroll offsets behave differently per platform in RTL (negative scrollLeft on web, flipped
 * views on native), so the scroller itself is forced LTR and the slides are laid out in reverse
 * order; each slide restores the natural direction for its content.
 */
export default function WelcomeScreen() {
  const t = useT();
  const rtl = useIsRTL();
  const token = useSession((s) => s.token);
  const setStep = useSession((s) => s.setStep);
  const ref = useRef<ScrollView>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const [guardianOpen, setGuardianOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const cleanCode = inviteCode.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  useEffect(() => {
    const { pendingGuardianCode, guardianOnly } = useSession.getState();
    if (token && pendingGuardianCode) router.replace({ pathname: '/guardian/[code]', params: { code: pendingGuardianCode } });
    else if (token && guardianOnly) router.replace(GUARDIAN_HOME);
    else if (token) router.replace('/(onboarding)/intention');
    else setStep('welcome');
  }, [token, setStep]);

  const openInvite = () => {
    if (!cleanCode) return;
    setGuardianOpen(false);
    router.push({ pathname: '/guardian/[code]', params: { code: cleanCode } });
  };

  const toX = (i: number) => (rtl ? COUNT - 1 - i : i) * width;
  const fromX = (x: number) => {
    if (!width) return 0;
    const p = Math.max(0, Math.min(COUNT - 1, Math.round(Math.abs(x) / width)));
    return rtl ? COUNT - 1 - p : p;
  };

  // Keep the visible page aligned after (re)measuring, e.g. on first layout in RTL or a window resize.
  const indexRef = useRef(index);
  indexRef.current = index;
  useEffect(() => {
    if (!width) return;
    const x = (rtl ? COUNT - 1 - indexRef.current : indexRef.current) * width;
    // Next frame: the content must be laid out before scrollTo has an effect.
    const id = requestAnimationFrame(() => ref.current?.scrollTo({ x, animated: false }));
    return () => cancelAnimationFrame(id);
  }, [width, rtl]);

  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    if (w && w !== width) setWidth(w);
  };

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = fromX(e.nativeEvent.contentOffset.x);
    if (i !== index) setIndex(i);
  };

  const goTo = (i: number) => {
    setIndex(i);
    ref.current?.scrollTo({ x: toX(i), animated: true });
  };

  const slides: Array<{ title: string; body: string; visual: ReactNode }> = [
    { title: t('onboarding.welcome.slide1Title'), body: t('onboarding.welcome.slide1Body'), visual: <WelcomePoints /> },
    { title: t('onboarding.welcome.slide2Title'), body: t('onboarding.welcome.slide2Body'), visual: <WhyWeMatchSample /> },
    { title: t('onboarding.welcome.slide3Title'), body: t('onboarding.welcome.slide3Body'), visual: <HalalModeLevels /> },
  ];
  const physical = rtl ? [...slides].reverse() : slides;

  const footer = (
    <>
      <Button label={t('onboarding.welcome.getStarted')} size="lg" fullWidth haptic onPress={() => router.push('/(onboarding)/phone')} testID="welcome-start" />
      <Button label={t('onboarding.welcome.guardian')} variant="ghost" fullWidth onPress={() => setGuardianOpen(true)} testID="welcome-guardian" />
    </>
  );

  return (
    <Screen pattern scroll={false} padded={false} footer={footer}>
      <View style={styles.top}>
        <Wordmark size={18} />
      </View>

      <View style={styles.carousel} onLayout={onLayout}>
        {width > 0 ? (
          <ScrollView
            ref={ref}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={onScroll}
            onMomentumScrollEnd={onScroll}
            scrollEventThrottle={32}
            // The scroller stays LTR on every platform so scroll offsets behave identically;
            // each slide re-applies the natural direction for its content below.
            {...directionProps('ltr')}
          >
            {physical.map((s, i) => (
              <View
                key={i}
                style={[styles.slide, { width }]}
                {...directionProps(rtl ? 'rtl' : 'ltr')}
                accessibilityLabel={t('onboarding.welcome.slideLabel', { n: (rtl ? COUNT - 1 - i : i) + 1, total: COUNT })}
              >
                <View style={{ gap: spacing.sm }}>
                  <Text variant="display">{s.title}</Text>
                  <Text variant="body" color={colors.textMuted}>
                    {s.body}
                  </Text>
                </View>
                <View style={{ marginTop: spacing.xxl }}>{s.visual}</View>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>

      <View style={styles.nav}>
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <Pressable
              key={i}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.welcome.slideLabel', { n: i + 1, total: COUNT })}
              accessibilityState={{ selected: i === index }}
              onPress={() => goTo(i)}
              hitSlop={8}
              style={[styles.dot, i === index && styles.dotOn]}
            />
          ))}
        </View>
        <IconButton
          name="arrow-forward"
          directional
          bg={colors.primary}
          color={palette.white}
          accessibilityLabel={t('common.actions.next')}
          onPress={() => (index < COUNT - 1 ? goTo(index + 1) : router.push('/(onboarding)/phone'))}
        />
      </View>

      <Sheet
        visible={guardianOpen}
        onClose={() => setGuardianOpen(false)}
        title={t('onboarding.welcome.guardianTitle')}
        testID="welcome-guardian-sheet"
        footer={
          <>
            <Button
              label={t('family.guardianSide.home.codeOpen')}
              icon="mail-open-outline"
              size="lg"
              fullWidth
              disabled={cleanCode.length < 4}
              onPress={openInvite}
              testID="welcome-guardian-open"
            />
            <Button label={t('common.actions.cancel')} variant="ghost" fullWidth onPress={() => setGuardianOpen(false)} />
          </>
        }
      >
        <Text variant="body">{t('onboarding.welcome.guardianBody')}</Text>
        <Text variant="body" color={colors.textMuted}>
          {t('onboarding.welcome.guardianBody2')}
        </Text>
        <Field label={t('family.guardianSide.home.haveCode')}>
          <TextField
            value={inviteCode}
            onChangeText={setInviteCode}
            placeholder={t('family.guardianSide.home.codePlaceholder')}
            autoCapitalize="characters"
            autoCorrect={false}
            maxLength={24}
            returnKeyType="go"
            onSubmitEditing={openInvite}
            accessibilityLabel={t('family.guardianSide.home.codeLabel')}
            style={{ textAlign: 'left', writingDirection: 'ltr', fontFamily: 'Inter_500Medium', letterSpacing: 1, fontSize: 18 }}
            testID="welcome-guardian-code"
          />
        </Field>
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { alignItems: 'center', paddingTop: spacing.lg, paddingBottom: spacing.md },
  carousel: { flex: 1 },
  slide: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.xl, paddingVertical: spacing.sm },
  dots: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: palette.sand300 },
  dotOn: { width: 24, backgroundColor: colors.primary },
});
