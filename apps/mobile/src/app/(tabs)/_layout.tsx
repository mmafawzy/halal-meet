import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';

import { useIncoming, useMatches } from '@/api/hooks';
import { Icon, type IconName } from '@/components/ui';
import { useLocale, useT } from '@/i18n';
import { useSession } from '@/state/session';
import { colors, fontFamily, palette } from '@/theme';

const ICONS: Record<string, [IconName, IconName]> = {
  discover: ['compass', 'compass-outline'],
  matches: ['heart', 'heart-outline'],
  conversations: ['chatbubbles', 'chatbubbles-outline'],
  family: ['people', 'people-outline'],
  profile: ['person-circle', 'person-circle-outline'],
};

export default function TabsLayout() {
  const t = useT();
  const locale = useLocale();
  const token = useSession((s) => s.token);
  const matches = useMatches();
  const incoming = useIncoming();

  if (!token) return <Redirect href="/" />;

  const yourMove = matches.data?.filter((m) => m.status === 'active' && m.yourMove).length ?? 0;
  const incomingCount = incoming.data?.count ?? 0;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: palette.navy300,
        tabBarStyle: {
          backgroundColor: palette.white,
          borderTopColor: colors.borderSoft,
          height: Platform.OS === 'web' ? 64 : undefined,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontFamily: fontFamily(locale, 'medium'), fontSize: locale === 'ar' ? 12 : 11 },
        tabBarIcon: ({ focused, color, size }) => {
          const pair = ICONS[route.name] ?? (['ellipse', 'ellipse-outline'] as [IconName, IconName]);
          return <Icon name={focused ? pair[0] : pair[1]} size={size - 2} color={color as string} />;
        },
        tabBarBadgeStyle: { backgroundColor: colors.primary, fontSize: 10 },
      })}
    >
      <Tabs.Screen name="discover" options={{ title: t('common.tabs.discover') }} />
      <Tabs.Screen
        name="matches"
        options={{ title: t('common.tabs.matches'), tabBarBadge: incomingCount > 0 ? incomingCount : undefined }}
      />
      <Tabs.Screen
        name="conversations"
        options={{ title: t('common.tabs.conversations'), tabBarBadge: yourMove > 0 ? yourMove : undefined }}
      />
      <Tabs.Screen name="family" options={{ title: t('common.tabs.family') }} />
      <Tabs.Screen name="profile" options={{ title: t('common.tabs.profile') }} />
    </Tabs>
  );
}
