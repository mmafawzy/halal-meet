import { Redirect, useLocalSearchParams } from 'expo-router';

import { cleanInviteCode } from '@/components/family/shared';

/** Invitation links are `https://halalmeet.app/g/<code>` (and `halalmeet://g/<code>`): open the invite landing. */
export default function InviteLinkRedirect() {
  const { code } = useLocalSearchParams<{ code: string }>();
  return <Redirect href={{ pathname: '/guardian/[code]', params: { code: cleanInviteCode(code) } }} />;
}
