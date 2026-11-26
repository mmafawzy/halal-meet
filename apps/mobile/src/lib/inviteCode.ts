/** Public base of guardian invitation links; `/g/<code>` opens `src/app/guardian/[code].tsx`. */
export const INVITE_LINK_BASE = 'https://halalmeet.app/g/';

/** The invitation link for a code returned by POST /guardians or POST /guardians/:id/invite. */
export function inviteLink(code: string): string {
  return `${INVITE_LINK_BASE}${code}`;
}

/**
 * Extracts an invitation code from typed or pasted input: a bare code, or a whole invite link
 * (`https://halalmeet.app/g/<code>`). Case and `-`/`_` are kept — server codes are base64url and exact.
 */
export function cleanInviteCode(raw: string | undefined): string {
  const s = (raw ?? '').trim();
  const fromLink = s.match(/\/g\/([^/?#\s]+)/)?.[1];
  return (fromLink ?? s).replace(/[^A-Za-z0-9_-]/g, '');
}
