import { describe, expect, it } from 'vitest';

import { cleanInviteCode, inviteLink } from './inviteCode';

describe('cleanInviteCode', () => {
  it('keeps server codes exactly (case, - and _)', () => {
    expect(cleanInviteCode('jyPov6FWbsHdFccnf1R1tA')).toBe('jyPov6FWbsHdFccnf1R1tA');
    expect(cleanInviteCode('  aB-c_D9 ')).toBe('aB-c_D9');
  });

  it('pulls the code out of a pasted invite link', () => {
    expect(cleanInviteCode(inviteLink('Xy_9-zZ'))).toBe('Xy_9-zZ');
    expect(cleanInviteCode('Join me: https://halalmeet.app/g/Qw3rTy?ref=wa')).toBe('Qw3rTy');
  });

  it('drops characters that cannot be in a code', () => {
    expect(cleanInviteCode('K7Q2 M9XA!')).toBe('K7Q2M9XA');
    expect(cleanInviteCode(undefined)).toBe('');
  });
});
