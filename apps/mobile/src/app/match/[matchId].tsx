import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, ZoomIn } from 'react-native-reanimated';
import Svg, { Polygon } from 'react-native-svg';

import { useMatches, useMe, useSendMessage } from '@/api/hooks';
import { useProfileActions } from '@/components/profile/useProfileActions';
import { Avatar, Button, Card, EmptyState, Icon, LoadingState, Screen, StarPattern, starPoints, Text } from '@/components/ui';
import { useLocale, useT, useViewerGender } from '@/i18n';
import { renderDiscussSafe, renderReason } from '@/lib/compat';
import { colors, palette, radii, spacing } from '@/theme';

/** Screen 32 — mutual match celebration: gold geometric bloom, why you match, first-message chips. */
export default function MatchCelebrationScreen() {
  const t = useT();
  const locale = useLocale();
  const gender = useViewerGender();
  const { matchId } = useLocalSearchParams<{ matchId: string }>();
  const matches = useMatches();
  const me = useMe();
  const send = useSendMessage(matchId ?? '');
  const { shareWithGuardian, sharing } = useProfileActions();
  const [starter, setStarter] = useState(0);

  const match = matches.data?.find((m) => m.matchId === matchId);

  useEffect(() => {
    if (match && Platform.OS !== 'web') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [match?.matchId]);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/matches'));

  if (matches.isLoading) {
    return (
      <Screen bg={palette.navy900}>
        <LoadingState />
      </Screen>
    );
  }

  if (!match) {
    return (
      <Screen>
        <EmptyState
          icon="heart-dislike-outline"
          title={t('profile.celebration.notFound')}
          action={<Button label={t('common.actions.close')} variant="secondary" onPress={close} />}
        />
      </Screen>
    );
  }

  const other = match.other;
  const c = other.compatibility;
  const myProfile = me.data?.profile;
  const starters = [t('chat.starter.salam', { name: other.firstName }), t('chat.starter.question')];
  const alreadyTalking = !!match.lastMessage;
  const goChat = () => router.replace({ pathname: '/chat/[matchId]', params: { matchId: match.matchId } });

  const sendSalam = () => {
    if (alreadyTalking) {
      goChat();
      return;
    }
    send.mutate({ kind: 'text', body: starters[starter] }, { onSuccess: goChat });
  };

  return (
    <Screen
      bg={palette.navy900}
      testID="match-screen"
      footer={
        <>
          <Button
            label={alreadyTalking ? t('profile.celebration.openChat') : t('profile.celebration.sendSalam')}
            variant="gold"
            size="lg"
            icon="chatbubble-ellipses-outline"
            fullWidth
            haptic
            loading={send.isPending}
            onPress={sendSalam}
            testID="match-send-salam"
          />
          <Button
            label={t('profile.celebration.share')}
            variant="dark"
            icon="people-outline"
            fullWidth
            style={{ borderWidth: 1, borderColor: 'rgba(251,247,240,0.3)' }}
            loading={sharing}
            onPress={() => match && shareWithGuardian(match.other.id)}
            testID="match-share-guardian"
          />
          <Button label={t('profile.celebration.later')} variant="ghost" fullWidth onPress={close} testID="match-later" />
        </>
      }
    >
      <StarPattern color={palette.gold500} opacity={0.08} />
      <View style={{ alignItems: 'center', gap: spacing.lg, paddingTop: spacing.lg }}>
        <View style={styles.bloomWrap}>
          <Animated.View entering={ZoomIn.duration(900)} style={StyleSheet.absoluteFill}>
            <Svg width={220} height={220}>
              <Polygon points={starPoints(110, 110, 104)} fill="none" stroke={palette.gold500} strokeOpacity={0.55} strokeWidth={1.5} />
              <Polygon points={starPoints(110, 110, 80)} fill={palette.gold500} fillOpacity={0.08} stroke={palette.gold300} strokeOpacity={0.5} strokeWidth={1} />
            </Svg>
          </Animated.View>
          <Animated.View entering={FadeIn.delay(250).duration(500)} style={styles.avatars}>
            <Avatar
              id={myProfile?.id ?? 'me'}
              name={myProfile?.firstName ?? ''}
              photoUrl={myProfile?.photoUrl ?? null}
              size={84}
              ring={palette.gold500}
            />
            <View style={styles.heart}>
              <Icon name="heart" size={18} color={palette.navy900} />
            </View>
            <Avatar id={other.id} name={other.firstName} photoUrl={other.photoUrl} photoState={other.photoState} size={84} ring={palette.gold500} />
          </Animated.View>
        </View>

        <Animated.View entering={FadeInDown.delay(400).duration(500)} style={{ alignItems: 'center', gap: spacing.xs }}>
          <Text variant="display" color={palette.gold300} center>
            {t('profile.celebration.title')}
          </Text>
          <Text variant="body" color={palette.ivory100} center>
            {t('profile.celebration.subtitle', { name: other.firstName })}
          </Text>
          <Text variant="caption" fontLocale="en" color={palette.gold300}>
            {t('common.compatible', { pct: c.displayPct })}
          </Text>
        </Animated.View>
      </View>

      <Animated.View entering={FadeInDown.delay(600).duration(500)} style={{ gap: spacing.md, marginTop: spacing.xl }}>
        {c.reasons.length > 0 || c.discuss.length > 0 ? (
          <Card style={styles.darkCard} padded>
            <Text variant="overline" color={palette.gold300}>
              {t('profile.celebration.reasons')}
            </Text>
            <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
              {c.reasons.slice(0, 3).map((r, i) => (
                <View key={`${r.questionKey}-${i}`} style={styles.row}>
                  <Icon name="checkmark-circle" size={16} color={palette.emerald100} />
                  <Text variant="small" color={palette.ivory50} style={{ flex: 1 }}>
                    {renderReason(r, locale, gender)}
                  </Text>
                </View>
              ))}
              {c.discuss[0] ? (
                <View style={styles.row}>
                  <Icon name="alert-circle" size={16} color={palette.gold300} />
                  <Text variant="small" color={palette.gold100} style={{ flex: 1 }}>
                    {renderDiscussSafe(c.discuss[0], locale, gender).title}
                  </Text>
                </View>
              ) : null}
            </View>
          </Card>
        ) : null}

        {!alreadyTalking ? (
          <View style={{ gap: spacing.sm }}>
            <Text variant="overline" color={palette.gold300}>
              {t('profile.celebration.starters')}
            </Text>
            {starters.map((s, i) => {
              const on = starter === i;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setStarter(i)}
                  style={[styles.starter, on && styles.starterOn]}
                  testID={`match-starter-${i}`}
                >
                  <Icon name={on ? 'radio-button-on' : 'radio-button-off'} size={18} color={on ? palette.gold500 : palette.navy300} />
                  <Text variant="small" color={palette.ivory50} style={{ flex: 1 }}>
                    {s}
                  </Text>
                </Pressable>
              );
            })}
            <Text variant="caption" color={palette.navy300}>
              {t('profile.celebration.note')}
            </Text>
          </View>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  bloomWrap: { width: 220, height: 220, alignItems: 'center', justifyContent: 'center' },
  avatars: { flexDirection: 'row', alignItems: 'center' },
  heart: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.gold500,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
    marginHorizontal: -8,
    borderWidth: 2,
    borderColor: palette.navy900,
  },
  darkCard: { backgroundColor: 'rgba(251,247,240,0.06)', borderColor: 'rgba(201,162,75,0.35)' },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  starter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: 'rgba(251,247,240,0.18)',
  },
  starterOn: { borderColor: palette.gold500, backgroundColor: 'rgba(201,162,75,0.12)' },
});
