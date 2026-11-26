import { defaultGuardianPermissions, type ProfileInput } from '@halal-meet/core';
import { describe, expect, it } from 'vitest';

import { createMockApi } from './index';

const PROFILE: ProfileInput = {
  firstName: 'Ahmed',
  gender: 'male',
  birthDate: '1995-03-10',
  nationality: ['EG'],
  country: 'EG',
  city: 'Cairo',
  languages: ['ar', 'en'],
  maritalStatus: 'never_married',
  hasChildren: false,
  intention: 'within_1y',
  halalMode: 'guided',
  acceptedModes: ['private', 'guided', 'wali'],
  photoVisibility: 'request',
  openToRelocate: false,
  relocateCountries: [],
  intlVisibility: 'on',
};

async function setup() {
  let t = new Date('2026-10-08T10:00:00');
  const api = createMockApi({ latencyMs: 0, replyDelayMs: 1000, now: () => t });
  await api.otpRequest({ phone: '+201000000000' });
  await api.otpVerify({ phone: '+201000000000', code: '000000' });
  await api.updateProfile(PROFILE);
  await api.me(); // seeds the demo world
  return { api, advance: (ms: number) => (t = new Date(t.getTime() + ms)) };
}

describe('mock notifications', () => {
  it('records seeded incoming interests (count only on the free plan, Serious Interest in full)', async () => {
    const { api } = await setup();
    const page = await api.notifications.list();
    const interests = page.items.filter((i) => i.kind === 'interest');
    const serious = page.items.filter((i) => i.kind === 'serious_interest');
    expect(interests.length).toBeGreaterThan(0);
    expect(interests.every((i) => i.payload.countOnly === true && !i.payload.fromId)).toBe(true);
    expect(serious).toHaveLength(1);
    expect(typeof serious[0]!.payload.firstName).toBe('string');
    expect(page.unread).toBe(page.items.length);
    expect(await api.notifications.unreadCount()).toBe(page.items.length);
  });

  it('adds one (collapsed) message item per conversation for replies and clears them when the chat is read', async () => {
    const { api, advance } = await setup();
    const [match] = await api.matches();
    await api.sendMessage(match!.matchId, { kind: 'text', body: 'Assalamu alaikum' });
    await api.sendMessage(match!.matchId, { kind: 'text', body: 'How is your week going?' });
    advance(10_000);
    const items = (await api.notifications.list()).items.filter((i) => i.kind === 'message');
    expect(items).toHaveLength(1);
    expect(items[0]!.payload).toMatchObject({ matchId: match!.matchId });
    expect(items[0]!.payload.count).toBeGreaterThanOrEqual(1);
    const before = await api.notifications.unreadCount();
    expect(await api.notifications.markRead({ matchId: match!.matchId })).toBe(before - 1);
  });

  it('records guardian acceptance and opinions, and supports read-all and prefs', async () => {
    const { api } = await setup();
    const invite = await api.inviteGuardian({ name: 'Baba', relationship: 'father', permissions: defaultGuardianPermissions('wali') });
    await api.dev!.simulateGuardianAccept(invite.guardian.id);
    const kinds = (await api.notifications.list()).items.map((i) => i.kind);
    expect(kinds).toContain('guardian_accepted');
    expect(kinds).toContain('guardian_opinion');

    expect(await api.notifications.markRead({ all: true })).toBe(0);
    const prefs = await api.notifications.putPrefs({ categories: { messages: false }, topPicksTime: '21:30' });
    expect(prefs).toMatchObject({ topPicksTime: '21:30', quietHours: true, categories: { messages: false, matches: true } });
    await expect(api.notifications.putPrefs({ topPicksTime: 'midnight' })).rejects.toThrow();
    expect(api.notifications.subscribe({ onEvent: () => undefined, onStatus: () => undefined })).toBeNull();
  });
});
