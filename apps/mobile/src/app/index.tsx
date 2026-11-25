import { Redirect } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';

import { useMe } from '@/api/hooks';
import { ErrorState, LoadingState, Wordmark } from '@/components/ui';
import { useSession } from '@/state/session';
import { colors, spacing } from '@/theme';
import { GUARDIAN_HOME } from '@/components/family/shared';

/**
 * Splash / router gate (screen 1): language → welcome → onboarding resume → Discover.
 * Guardians: pending invitation → /guardian/<code>; guardian-only accounts → /guardian.
 */
export default function Index() {
  const locale = useSession((s) => s.locale);
  const token = useSession((s) => s.token);
  const step = useSession((s) => s.onboardingStep);
  const done = useSession((s) => s.onboardingDone);
  const setGender = useSession((s) => s.setGender);
  const completeOnboarding = useSession((s) => s.completeOnboarding);
  const pendingGuardianCode = useSession((s) => s.pendingGuardianCode);
  const guardianOnly = useSession((s) => s.guardianOnly);
  const me = useMe(!!token);

  useEffect(() => {
    const g = me.data?.profile?.gender;
    if (g) setGender(g);
    if (me.data?.onboardingComplete && !done) completeOnboarding();
  }, [me.data, setGender, done, completeOnboarding]);

  // A guardian accepting an invitation goes back to it (e.g. after a native RTL reload), never through
  // member onboarding; a guardian-only account opens the guardian area.
  if (pendingGuardianCode && !done) return <Redirect href={{ pathname: '/guardian/[code]', params: { code: pendingGuardianCode } }} />;
  if (!locale) return <Redirect href="/(onboarding)/language" />;
  if (!token) return <Redirect href="/(onboarding)/welcome" />;
  if (guardianOnly && !done) return <Redirect href={GUARDIAN_HOME} />;

  if (me.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: spacing.xl }}>
        <Wordmark />
        <LoadingState />
      </View>
    );
  }
  if (me.isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center' }}>
        <ErrorState onRetry={() => void me.refetch()} />
      </View>
    );
  }
  if (done || me.data?.onboardingComplete) return <Redirect href="/(tabs)/discover" />;

  const resume = step === 'language' || step === 'welcome' || step === 'phone' || step === 'otp' ? 'intention' : step;
  return <Redirect href={`/(onboarding)/${resume}`} />;
}
