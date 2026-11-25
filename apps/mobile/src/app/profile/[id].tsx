import { optionLabel, pick, QUESTIONS_BY_KEY, type ProfileCard } from '@halal-meet/core';
import { router, useLocalSearchParams } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { ApiError } from '@/api/types';
import { useMatches, useProfile } from '@/api/hooks';
import { useInterestFlow } from '@/components/interest/useInterestFlow';
import { useKeyFactText } from '@/components/interest/keyFacts';
import { HalalModeBadge, PassportBadge, VerificationBadges } from '@/components/profile/Badges';
import { ProfilePhoto } from '@/components/profile/ProfilePhoto';
import { useProfileActions } from '@/components/profile/useProfileActions';
import { WhyWeMatch } from '@/components/profile/WhyWeMatch';
import { BlockSheet, ReportSheet } from '@/components/safety/ReportSheet';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Header,
  Icon,
  IconButton,
  ListRow,
  LoadingState,
  RowGroup,
  Screen,
  Sheet,
  Tag,
  Text,
} from '@/components/ui';
import { useLocale, useT, useTs, useViewerGender } from '@/i18n';
import { languageLabel } from '@/lib/cities';
import { placeLabel } from '@/lib/format';
import { colors, palette, radii, spacing } from '@/theme';

/** Screens 22–25 — full introduction profile with Why we match, Ask Before You Match and sticky actions. */
export default function ProfileScreen() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const profile = useProfile(id);
  const matches = useMatches();
  const [sent, setSent] = useState(false);
  const flow = useInterestFlow({
    onSent: (_c, matched) => {
      if (!matched) setSent(true);
    },
    onPassed: () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/discover')),
  });

  if (profile.isLoading) {
    return (
      <Screen header={<Header />}>
        <LoadingState label={t('profile.states.loading')} />
      </Screen>
    );
  }

  if (profile.isError || !profile.data) {
    const notFound = profile.error instanceof ApiError && profile.error.status === 404;
    return (
      <Screen header={<Header />}>
        {notFound || !profile.error ? (
          <EmptyState icon="person-outline" title={t('profile.states.notFound')} body={t('profile.states.notFoundBody')} />
        ) : (
          <ErrorState onRetry={() => void profile.refetch()} />
        )}
      </Screen>
    );
  }

  const card = profile.data;
  const match = matches.data?.find((m) => m.other.id === card.id && m.status === 'active');

  return (
    <ProfileBody
      card={card}
      matchId={match?.matchId ?? null}
      sent={sent}
      onInterested={() => flow.interested(card, { withNote: true })}
      onSerious={() => flow.serious(card)}
      onNotForMe={() => flow.notForMe(card)}
      sending={flow.sending}
      sheets={flow.sheets}
    />
  );
}

function ProfileBody({
  card,
  matchId,
  sent,
  sending,
  sheets,
  onInterested,
  onSerious,
  onNotForMe,
}: {
  card: ProfileCard;
  matchId: string | null;
  sent: boolean;
  sending: boolean;
  sheets: ReactNode;
  onInterested: () => void;
  onSerious: () => void;
  onNotForMe: () => void;
}) {
  const t = useT();
  const ts = useTs();
  const locale = useLocale();
  const gender = useViewerGender();
  const factText = useKeyFactText();
  const { isSaved, toggleSave, isShared, shareWithGuardian, unshareWithGuardian } = useProfileActions();
  const [menu, setMenu] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const saved = isSaved(card.id);
  const shared = isShared(card.id);
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/(tabs)/discover'));

  const common = card.compatibility.reasons.filter((r) => r.value && QUESTIONS_BY_KEY[r.questionKey]);

  const footer = matchId ? (
    <Card tone="primary" style={{ gap: spacing.sm }}>
      <Text variant="subheading">{t('profile.unavailable.title')}</Text>
      <Text variant="small" color={colors.textMuted}>
        {t('profile.unavailable.body')}
      </Text>
      <Button
        label={t('profile.unavailable.open')}
        icon="chatbubbles-outline"
        fullWidth
        onPress={() => router.push({ pathname: '/chat/[matchId]', params: { matchId } })}
        testID="profile-open-chat"
      />
    </Card>
  ) : sent ? (
    <View style={styles.sent} testID="profile-sent">
      <Icon name="checkmark-circle" size={20} color={colors.primary} />
      <View style={{ flex: 1 }}>
        <Text variant="bodyStrong" color={colors.primary}>
          {t('profile.actions.sent')}
        </Text>
        <Text variant="caption" color={colors.textMuted}>
          {ts('profile.actions.sentBody', card.gender, { name: card.firstName })}
        </Text>
      </View>
    </View>
  ) : (
    <>
      <View style={styles.actionRow}>
        <Button
          label={t('profile.actions.notForMe')}
          variant="outline"
          icon="close"
          style={{ flex: 1 }}
          disabled={sending}
          onPress={onNotForMe}
          testID="profile-pass"
        />
        <Button
          label={t('profile.actions.interested')}
          icon="heart"
          haptic
          style={{ flex: 1.3 }}
          loading={sending}
          onPress={onInterested}
          testID="profile-interested"
        />
      </View>
      <Button
        label={t('profile.actions.serious')}
        variant="gold"
        size="sm"
        fullWidth
        disabled={sending}
        onPress={onSerious}
        testID="profile-serious"
      />
    </>
  );

  return (
    <Screen
      testID="profile-screen"
      header={
        <Header
          title={card.firstName}
          right={
            <View testID="profile-menu-open">
              <IconButton name="ellipsis-horizontal" accessibilityLabel={t('profile.menu.title')} onPress={() => setMenu(true)} />
            </View>
          }
        />
      }
      footer={footer}
    >
      <View style={{ gap: spacing.xl }}>
        <View style={{ gap: spacing.md }}>
          <ProfilePhoto card={card} />
          <View style={{ alignItems: 'center', gap: spacing.xs }}>
            <Text variant="title" center>
              {t('matches.nameAge', { name: card.firstName, age: card.age })}
            </Text>
            <Text variant="small" color={colors.textMuted} center>
              {ts('profile.header.lives', card.gender, { place: placeLabel(card.country, card.city, locale) })}
            </Text>
            <View style={styles.badges}>
              <HalalModeBadge mode={card.halalMode} />
              {card.isNew ? <Tag label={t('profile.header.joinedNew')} tone="neutral" /> : null}
              {saved ? <Tag label={t('profile.menu.saved')} icon="bookmark" tone="primary" /> : null}
            </View>
            <VerificationBadges kinds={card.verifications} compact={false} style={{ justifyContent: 'center' }} />
            {card.passport ? <PassportBadge passport={card.passport} gender={card.gender} style={{ alignSelf: 'center', marginTop: spacing.xs }} /> : null}
          </View>
          {card.sentYouSeriousInterest ? (
            <Card tone="premium" style={styles.inlineRow}>
              <Text variant="body" fontLocale="en">
                ⭐
              </Text>
              <Text variant="bodyStrong" color="#8A6A22" style={{ flex: 1 }}>
                {ts('profile.header.seriousAboutYou', card.gender)}
              </Text>
            </Card>
          ) : null}
        </View>

        <WhyWeMatch card={card} />

        {card.about ? (
          <Section title={t('profile.about')}>
            <Text variant="body">{card.about}</Text>
          </Section>
        ) : null}

        <Section title={t('profile.sections.marriage')}>
          <RowGroup>
            <ListRow icon="heart-outline" label={t('profile.fields.intention')} value={t(`common.intentionShort.${card.intention}`)} />
            <ListRow icon="people-outline" label={t(`common.halalMode.${card.halalMode}`)} description={t(`common.halalModeDesc.${card.halalMode}`)} />
            <ListRow icon="document-text-outline" label={t('profile.fields.marital')} value={t(`common.marital.${card.maritalStatus}`)} />
            <ListRow
              icon="happy-outline"
              label={t('profile.fields.children')}
              value={card.hasChildren ? ts('common.children.has', card.gender) : t('common.children.none')}
            />
          </RowGroup>
        </Section>

        {card.profession || card.educationLevel ? (
          <Section title={t('profile.sections.education')}>
            <RowGroup>
              {card.profession ? <ListRow icon="briefcase-outline" label={t('profile.fields.profession')} value={card.profession} /> : null}
              {card.educationLevel ? <ListRow icon="school-outline" label={t('profile.fields.education')} value={card.educationLevel} /> : null}
            </RowGroup>
          </Section>
        ) : null}

        {card.languages.length > 0 ? (
          <Section title={t('profile.sections.languages')}>
            <View style={styles.badges}>
              {card.languages.map((l) => (
                <Tag key={l} label={languageLabel(l, locale)} icon="language-outline" tone="neutral" />
              ))}
            </View>
          </Section>
        ) : null}

        <Section title={t('profile.common.title')}>
          {common.length > 0 ? (
            <View style={{ gap: spacing.sm }}>
              <Text variant="small" color={colors.textMuted}>
                {t('profile.common.body')}
              </Text>
              {common.slice(0, 5).map((r) => {
                const q = QUESTIONS_BY_KEY[r.questionKey]!;
                return (
                  <View key={r.questionKey} style={styles.commonCard}>
                    <Text variant="overline" color={colors.textMuted}>
                      {pick(q.topic, locale, gender)}
                    </Text>
                    <Text variant="bodyStrong">{optionLabel(q.key, r.value!, locale, gender)}</Text>
                  </View>
                );
              })}
            </View>
          ) : (
            <Card tone="muted" style={{ gap: 4 }}>
              <Text variant="bodyStrong">{t('profile.common.none')}</Text>
              <Text variant="small" color={colors.textMuted}>
                {t('profile.common.noneBody')}
              </Text>
            </Card>
          )}
        </Section>

        {card.keyFacts.length > 0 ? (
          <Section title={t('profile.abymPreview.title', { name: card.firstName })}>
            <Card style={{ gap: spacing.md }}>
              <Text variant="small" color={colors.textMuted}>
                {t('profile.abymPreview.body')}
              </Text>
              {card.keyFacts.map((f) => {
                const { topic, value } = factText(f);
                return (
                  <View key={f.questionKey} style={styles.inlineRow}>
                    <Icon name="ellipse" size={6} color={colors.primary} />
                    <Text variant="body" style={{ flex: 1 }}>
                      <Text variant="body" weight="semibold">
                        {topic}
                      </Text>
                      {' · '}
                      {value}
                    </Text>
                  </View>
                );
              })}
            </Card>
          </Section>
        ) : null}
      </View>

      <Sheet visible={menu} onClose={() => setMenu(false)} title={t('profile.menu.title')} testID="profile-menu">
        <View style={{ marginHorizontal: -spacing.xs }}>
          <RowGroup>
            <ListRow
              icon={saved ? 'bookmark' : 'bookmark-outline'}
              label={saved ? t('profile.menu.unsave') : t('profile.menu.save')}
              onPress={() => {
                toggleSave(card);
                setMenu(false);
              }}
            />
            <View testID={shared ? 'profile-menu-unshare-guardian' : 'profile-menu-share-guardian'}>
              <ListRow
                icon={shared ? 'people' : 'people-outline'}
                label={shared ? t('profile.menu.unshare') : t('profile.menu.share')}
                description={shared ? t('profile.menu.unshareBody') : t('profile.menu.shareBody')}
                onPress={() => {
                  setMenu(false);
                  if (shared) unshareWithGuardian(card.id);
                  else shareWithGuardian(card.id);
                }}
              />
            </View>
            <ListRow
              icon="flag-outline"
              label={t('profile.menu.report', { name: card.firstName })}
              danger
              onPress={() => {
                setMenu(false);
                setReportOpen(true);
              }}
            />
            <ListRow
              icon="hand-left-outline"
              label={t('profile.menu.block', { name: card.firstName })}
              danger
              onPress={() => {
                setMenu(false);
                setBlockOpen(true);
              }}
            />
          </RowGroup>
        </View>
      </Sheet>
      <ReportSheet
        visible={reportOpen}
        onClose={() => setReportOpen(false)}
        subjectId={card.id}
        subjectName={card.firstName}
        subjectGender={card.gender}
        onDone={(blocked) => blocked && leave()}
      />
      <BlockSheet
        visible={blockOpen}
        onClose={() => setBlockOpen(false)}
        subjectId={card.id}
        subjectName={card.firstName}
        subjectGender={card.gender}
        onDone={leave}
      />
      {sheets}
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: spacing.sm }}>
      <Text variant="overline" color={colors.textMuted}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, justifyContent: 'center' },
  inlineRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  actionRow: { flexDirection: 'row', gap: spacing.sm },
  sent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.primaryTint,
    borderWidth: 1,
    borderColor: palette.emerald100,
  },
  commonCard: {
    gap: 2,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: palette.white,
    borderWidth: 1,
    borderColor: colors.borderSoft,
  },
});
