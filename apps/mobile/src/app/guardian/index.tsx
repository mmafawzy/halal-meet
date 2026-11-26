import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useGuardianLinks } from '@/api/hooks';
import { useAccountActions } from '@/components/me/accountActions';
import { cleanInviteCode, guardianGender, permissionList } from '@/components/family/shared';
import { Avatar, Button, Card, EmptyState, ErrorState, Field, Header, Icon, LoadingState, Screen, Tag, Text, TextField } from '@/components/ui';
import { useT, useTs } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, spacing } from '@/theme';

const STATUS_TONE = { invited: 'amber', active: 'primary', paused: 'neutral' } as const;

/**
 * Guardian area home: the members this account supports (GET /guardian/members), and a field for an
 * invitation code. Guardian-only accounts land here from the splash gate.
 */
export default function GuardianHomeScreen() {
  const t = useT();
  const ts = useTs();
  const links = useGuardianLinks();
  const token = useSession((s) => s.token);
  const guardianOnly = useSession((s) => s.guardianOnly);
  const onboardingDone = useSession((s) => s.onboardingDone);
  const { signOut } = useAccountActions();
  const [code, setCode] = useState('');
  const clean = cleanInviteCode(code);

  const openCode = () => {
    if (clean.length < 4) return;
    router.push({ pathname: '/guardian/[code]', params: { code: clean } });
  };

  const createProfile = () => {
    useSession.getState().setGuardianOnly(false);
    useSession.getState().setStep('intention');
    router.replace('/(onboarding)/intention');
  };

  // Signed out: the invitation link is the way in.
  if (!token) return <Redirect href="/" />;

  const list = links.data ?? [];

  return (
    <Screen
      header={
        <Header
          back={!guardianOnly}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/family'))}
          title={t('family.guardianSide.home.title')}
        />
      }
      pattern
      testID="guardian-home"
    >
      <Text variant="body" color={colors.textMuted} style={{ marginBottom: spacing.lg }}>
        {t('family.guardianSide.home.subtitle')}
      </Text>

      {links.isLoading ? (
        <LoadingState />
      ) : links.isError ? (
        <ErrorState onRetry={() => void links.refetch()} />
      ) : list.length === 0 ? (
        <Card padded={false}>
          <EmptyState icon="mail-outline" title={t('family.guardianSide.home.empty')} body={t('family.guardianSide.home.emptyBody')} />
        </Card>
      ) : (
        <View style={{ gap: spacing.md }}>
          {list.map((l) => {
            const shared = permissionList(t, l.permissions);
            return (
              <Card key={l.guardianshipId} padded={false}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => router.push({ pathname: '/guardian/member/[memberId]', params: { memberId: l.memberId } })}
                  style={styles.row}
                  testID={`guardian-link-${l.memberId}`}
                >
                  <Avatar id={l.memberId} name={l.memberFirstName} size={56} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text variant="heading" numberOfLines={1}>
                      {l.memberFirstName}
                    </Text>
                    <View style={styles.tags}>
                      <Text variant="body" color={colors.textMuted}>
                        {t(`family.invite.relationships.${l.relationship}`)}
                      </Text>
                      <Tag tone={STATUS_TONE[l.status]} label={ts(`family.guardians.status.${l.status}`, guardianGender(l.relationship))} />
                    </View>
                    {l.status === 'paused' ? (
                      <Text variant="small" color={colors.textSubtle}>
                        {t('family.guardianSide.home.pausedNote')}
                      </Text>
                    ) : shared ? (
                      <Text variant="small" color={colors.textMuted} numberOfLines={2}>
                        {shared}
                      </Text>
                    ) : null}
                  </View>
                  <Icon name="chevron-forward" size={20} color={colors.textSubtle} directional />
                </Pressable>
              </Card>
            );
          })}
        </View>
      )}

      <Card style={{ marginTop: spacing.xl }}>
        <View style={{ gap: spacing.md }}>
          <Field label={t('family.guardianSide.home.haveCode')}>
            <TextField
              value={code}
              onChangeText={setCode}
              placeholder={t('family.guardianSide.home.codePlaceholder')}
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={24}
              returnKeyType="go"
              onSubmitEditing={openCode}
              accessibilityLabel={t('family.guardianSide.home.codeLabel')}
              style={{ textAlign: 'left', writingDirection: 'ltr', fontFamily: 'Inter_500Medium', letterSpacing: 1, fontSize: 18 }}
              testID="guardian-home-code"
            />
          </Field>
          <Button
            label={t('family.guardianSide.home.codeOpen')}
            icon="mail-open-outline"
            variant="secondary"
            disabled={clean.length < 4}
            onPress={openCode}
            testID="guardian-home-open"
          />
        </View>
      </Card>

      <View style={{ gap: spacing.sm, marginTop: spacing.xl }}>
        {onboardingDone ? (
          <Button label={t('family.guardianSide.home.backToMine')} variant="outline" fullWidth onPress={() => router.replace('/(tabs)/family')} testID="guardian-home-mine" />
        ) : (
          <Button label={t('family.guardianSide.home.createProfile')} variant="outline" fullWidth onPress={createProfile} testID="guardian-home-create-profile" />
        )}
        {guardianOnly ? (
          <Button label={t('family.guardianSide.home.signOut')} variant="ghost" fullWidth onPress={() => void signOut()} testID="guardian-home-signout" />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.lg },
  tags: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
});
