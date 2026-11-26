import { PHOTO_LIMITS, type ProfileInput } from '@halal-meet/core';
import { describe, expect, it } from 'vitest';

import { buildRequest } from '../live';
import { guessMime } from '../photoMime';
import { ApiError } from '../types';
import { createMockApi } from './index';
import { MOCK_PHOTO_APPROVAL_MS, MOCK_PHOTO_REVIEW_MS } from './photos';

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

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

async function setup() {
  let t = new Date('2026-10-08T10:00:00');
  const api = createMockApi({ latencyMs: 0, replyDelayMs: 1000, now: () => t });
  await api.otpVerify({ phone: '+201000000000', code: '000000' });
  await api.updateProfile(PROFILE);
  return {
    api,
    advance: (ms: number) => {
      t = new Date(t.getTime() + ms);
    },
  };
}

describe('photo client helpers', () => {
  it('builds PHOTO_ROUTES requests and guesses MIME types', () => {
    expect(buildRequest('photoAccess', { ownerId: 'abc' })).toEqual({ method: 'GET', path: '/photos/requests/outgoing/abc' });
    expect(buildRequest('uploadPhoto')).toEqual({ method: 'POST', path: '/me/photos' });
    expect(buildRequest('decidePhotoRequest', { id: 'r1' })).toEqual({ method: 'PUT', path: '/photos/requests/r1' });
    expect(guessMime({ uri: PNG })).toBe('image/png');
    expect(guessMime({ uri: 'file:///x/IMG_1.HEIC' })).toBe('image/heic');
    expect(guessMime({ uri: 'blob:abc', mimeType: 'image/webp' })).toBe('image/webp');
  });
});

describe('mock photos', () => {
  it('uploads (pending → approved), sets the main photo, reorders, deletes and enforces the limit', async () => {
    const { api, advance } = await setup();
    const a = await api.uploadPhoto({ uri: PNG });
    expect(a).toMatchObject({ status: 'pending', isMain: true, position: 0, mime: 'image/png' });
    expect((await api.me()).profile?.photoUrl).toBe(PNG);
    const b = await api.uploadPhoto({ uri: 'file:///b.jpg', position: 0 });
    expect((await api.myPhotos()).map((p) => p.id)).toEqual([b.id, a.id]);
    expect((await api.me()).profile?.photoUrl).toBe('file:///b.jpg');

    advance(MOCK_PHOTO_REVIEW_MS);
    expect((await api.myPhotos()).every((p) => p.status === 'approved')).toBe(true);

    const reordered = await api.reorderPhotos([a.id, b.id]);
    expect(reordered[0]).toMatchObject({ id: a.id, isMain: true });
    await expect(api.reorderPhotos([a.id])).rejects.toMatchObject({ status: 400 });

    await api.deletePhoto(a.id);
    expect((await api.myPhotos()).map((p) => [p.id, p.position])).toEqual([[b.id, 0]]);
    await expect(api.deletePhoto('nope')).rejects.toBeInstanceOf(ApiError);

    for (let i = 1; i < PHOTO_LIMITS.maxPhotos; i++) await api.uploadPhoto({ uri: PNG });
    await expect(api.uploadPhoto({ uri: PNG })).rejects.toMatchObject({ status: 409, code: 'photo_limit' });
    await expect(api.uploadPhoto({ uri: 'file:///x.gif', mimeType: 'image/gif' })).rejects.toMatchObject({ status: 415 });
  });

  it('"Request to view" goes pending, then approved, and the card shows the photo state as visible', async () => {
    const { api, advance } = await setup();
    const feed = await api.feed(null);
    const cards = feed.items.flatMap((it) => (it.type === 'profile' ? [it.card] : []));
    const blurred = cards.find((c) => c.photoState === 'blurred');
    const locked = cards.find((c) => c.photoState === 'locked');
    expect(blurred).toBeTruthy();

    expect(await api.photoAccess(blurred!.id)).toMatchObject({ status: 'none', canRequest: true, hasAccess: false });
    expect(await api.requestPhotoAccess(blurred!.id)).toMatchObject({ status: 'pending', canRequest: false });
    advance(MOCK_PHOTO_APPROVAL_MS);
    expect(await api.photoAccess(blurred!.id)).toMatchObject({ status: 'approved', hasAccess: true });
    expect((await api.profile(blurred!.id)).photoState).toBe('visible');

    if (locked) await expect(api.requestPhotoAccess(locked.id)).rejects.toMatchObject({ status: 409, code: 'not_requestable' });
  });

  it('seeds incoming requests; approve keeps them listed, decline removes them silently', async () => {
    const { api } = await setup();
    const incoming = await api.incomingPhotoRequests();
    expect(incoming).toHaveLength(2);
    expect(incoming[0]!.requester.gender).toBe('female');
    await api.decidePhotoRequest(incoming[0]!.id, 'approve');
    await api.decidePhotoRequest(incoming[1]!.id, 'decline');
    const after = await api.incomingPhotoRequests();
    expect(after.map((r) => [r.id, r.status])).toEqual([[incoming[0]!.id, 'approved']]);
    await api.decidePhotoRequest(incoming[0]!.id, 'decline'); // stop sharing
    expect(await api.incomingPhotoRequests()).toEqual([]);
    await expect(api.decidePhotoRequest('nope', 'approve')).rejects.toMatchObject({ status: 404 });
  });
});
