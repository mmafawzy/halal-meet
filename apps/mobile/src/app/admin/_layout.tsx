import { Stack } from 'expo-router';

import { colors } from '@/theme';

/** Moderation console (staff only; the gate lives in AdminShell). */
export default function AdminLayout() {
  return <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />;
}
