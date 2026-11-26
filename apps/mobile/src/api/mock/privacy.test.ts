import type { ProfileInput } from '@halal-meet/core';
import { describe, expect, it } from 'vitest';

import { ApiError } from '../types';
import { createMockApi } from './index';

const PROFILE: ProfileInput = {
  firstName: 'Sara',
  gender: 'female',
  birthDate: '1996-03-10',
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
  let t = new Date('2026-10-08T10:00:00Z');
  const api = createMockApi({ latencyMs: 0, replyDelayMs: 1000, now: () => t });
  await api.otpVerify({ phone: '+201000000009', code: '000000' });
  await api.updateProfile(PROFILE);
  return { api, advance: (ms: number) => (t = new Date(t.getTime() + ms)) };
}

const DAY = 86_400_000;

describe('mock privacy centre', () => {
  it('pauses, auto-resumes after the end date, and supports "until I resume"', async () => {
    const { api, advance } = await setup();
    const until = new Date('2026-10-07T10:00:00Z').toISOString();
    await expect(api.privacy.pause(until)).rejects.toBeInstanceOf(ApiError); // before the mock clock (2026-10-08)
    const end = new Date('2026-10-15T10:00:00Z').toISOString();
    expect(await api.privacy.pause(end)).toMatchObject({ state: 'paused', paused: true, pausedUntil: end });
    advance(8 * DAY);
    expect(await api.privacy.status()).toMatchObject({ state: 'active', paused: false });
    expect(await api.privacy.pause(null)).toMatchObject({ paused: true, pausedUntil: null });
    expect(await api.privacy.resume()).toMatchObject({ paused: false });
  });

  it('gates incognito on the plan', async () => {
    const { api } = await setup();
    await expect(api.privacy.setIncognito(true)).rejects.toMatchObject({ status: 403, code: 'plan_required' });
    await api.devGrant({ sku: 'plus_monthly' });
    expect(await api.privacy.setIncognito(true)).toMatchObject({ incognito: true, canIncognito: true });
  });

  it('schedules deletion with a 30-day grace period, restricts the account and cancels', async () => {
    const { api, advance } = await setup();
    const s = await api.privacy.requestDeletion();
    expect(s.state).toBe('deletion_pending');
    expect(new Date(s.deletionScheduledFor!).getTime() - new Date(s.deletionRequestedAt!).getTime()).toBe(30 * DAY);
    await expect(api.privacy.pause(null)).rejects.toMatchObject({ status: 403, code: 'deletion_pending' });
    expect((await api.privacy.cancelDeletion()).state).toBe('active');
    await api.privacy.requestDeletion();
    advance(31 * DAY);
    await expect(api.privacy.cancelDeletion()).rejects.toMatchObject({ status: 409, code: 'grace_period_over' });
  });

  it('records consents and refuses to withdraw required ones', async () => {
    const { api } = await setup();
    await api.privacy.putConsent('terms', true);
    const list = await api.privacy.putConsent('religious_data', false);
    expect(list.map((c) => c.kind).sort()).toEqual(['religious_data', 'terms']);
    await expect(api.privacy.putConsent('terms', false)).rejects.toMatchObject({ code: 'consent_required' });
  });

  it('reads preferences, blocks and guardian shares, and unblocks', async () => {
    const { api } = await setup();
    expect((await api.privacy.preferences()).saved).toBe(false);
    const prefs = { ageMin: 26, ageMax: 36, maritalStatuses: null, acceptChildren: true, verifiedOnly: true, languages: null, dimensionImportance: {} };
    await api.putPreferences(prefs);
    expect(await api.privacy.preferences()).toEqual({ saved: true, preferences: prefs });

    const feed = await api.feed();
    const id = feed.items.flatMap((i) => (i.type === 'profile' ? [i.card.id] : []))[0]!;
    await api.block({ subjectId: id });
    const blocks = await api.privacy.blocks();
    expect(blocks).toEqual([expect.objectContaining({ subjectId: id })]);
    expect(blocks[0]!.firstName).toBeTruthy();
    await api.privacy.unblock(id);
    expect(await api.privacy.blocks()).toEqual([]);

    await api.shareWithGuardians(id);
    expect((await api.privacy.guardianShares()).map((x) => x.subjectId)).toEqual([id]);

    const data = await api.privacy.exportData();
    expect(data.format).toBe('halal-meet-export');
    expect(data.profile).toMatchObject({ firstName: 'Sara' });
    expect(data.sharedWithGuardians).toHaveLength(1);
  });
});
