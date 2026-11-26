/**
 * In-memory photos & photo privacy (mirrors PHOTO_ROUTES; see apps/api photos.service.ts for the real rules).
 *
 * - Your photos keep the picked URI (a data: URI on the web, a file:// URI on native) inside the mock
 *   snapshot. New photos are `pending` for a few seconds, then `approved` (simulated moderation).
 * - "Request to view" works on seeded members whose photo is blurred. The demo has only one device, so the
 *   other person approves about 5 s later. Family-only (locked) photos answer 409 `not_requestable`.
 * - Two seeded members ask to see your photo once you have a profile, so the owner side has content.
 */
import {
  PHOTO_LIMITS,
  PHOTO_MIME_TYPES,
  type IncomingPhotoRequest,
  type Photo,
  type PhotoAccessView,
  type PhotoMime,
  type PhotoRequester,
  type PhotoStatus,
  type ProfileCard,
} from '@halal-meet/core';

import { guessMime } from '../photoMime';
import type { PhotoApi } from '../photos';
import { ApiError } from '../types';

export const MOCK_PHOTO_REVIEW_MS = 4000;
export const MOCK_PHOTO_APPROVAL_MS = 5000;

interface MockPhoto {
  id: string;
  uri: string;
  position: number;
  status: PhotoStatus;
  mime: PhotoMime;
  bytes: number;
  createdAt: string;
}

export interface MockPhotoState {
  photos: MockPhoto[];
  outgoing: Record<string, { status: 'pending' | 'approved'; at: string }>;
  /** null until seeded (needs a profile). */
  incoming: IncomingPhotoRequest[] | null;
  seq: number;
}

export interface PhotoMockDb {
  profile: { photoUrl: string | null } | null;
  photoMock?: MockPhotoState;
}

export interface PhotoMockContext {
  op<T>(fn: () => T): Promise<T>;
  db(): PhotoMockDb;
  now(): Date;
  /** Seeded members who could ask to see your photo (opposite gender). */
  requesters(): PhotoRequester[];
  /** The seeded member's baseline photo state, or null when unknown. */
  seedPhotoState(id: string): ProfileCard['photoState'] | null;
}

function fresh(): MockPhotoState {
  return { photos: [], outgoing: {}, incoming: null, seq: 1 };
}

export function createMockPhotoApi(ctx: PhotoMockContext): PhotoApi & {
  /** Card photo state after approvals (used by the mock's cardFor). */
  stateFor(ownerId: string, base: ProfileCard['photoState']): ProfileCard['photoState'];
} {
  const state = (): MockPhotoState => {
    const db = ctx.db();
    db.photoMock ??= fresh();
    return db.photoMock;
  };
  const ms = (iso: string) => new Date(iso).getTime();

  /** Applies the simulated moderation and the simulated approvals. */
  function tick(s: MockPhotoState) {
    const t = ctx.now().getTime();
    for (const p of s.photos) if (p.status === 'pending' && t - ms(p.createdAt) >= MOCK_PHOTO_REVIEW_MS) p.status = 'approved';
    for (const o of Object.values(s.outgoing)) if (o.status === 'pending' && t - ms(o.at) >= MOCK_PHOTO_APPROVAL_MS) o.status = 'approved';
  }

  function sorted(s: MockPhotoState): MockPhoto[] {
    return [...s.photos].sort((a, b) => a.position - b.position);
  }

  function renumber(s: MockPhotoState, ids: string[]) {
    ids.forEach((id, i) => {
      const p = s.photos.find((x) => x.id === id);
      if (p) p.position = i;
    });
    const main = sorted(s).find((p) => p.status !== 'rejected');
    const profile = ctx.db().profile;
    if (profile) profile.photoUrl = main?.uri ?? null;
  }

  function list(s: MockPhotoState): Photo[] {
    tick(s);
    const all = sorted(s);
    const mainId = all.find((p) => p.status !== 'rejected')?.id;
    return all.map((p) => ({ id: p.id, url: p.uri, position: p.position, status: p.status, mime: p.mime, bytes: p.bytes, isMain: p.id === mainId, createdAt: p.createdAt }));
  }

  function view(ownerId: string): PhotoAccessView {
    const s = state();
    tick(s);
    const base = ctx.seedPhotoState(ownerId);
    if (!base) throw new ApiError(404, 'not_found', { error: 'not_found' });
    const req = s.outgoing[ownerId];
    const hasAccess = base === 'visible' || req?.status === 'approved';
    return { ownerId, status: req ? req.status : 'none', canRequest: base === 'blurred' && !req, hasAccess };
  }

  function seedIncoming(s: MockPhotoState) {
    if (s.incoming !== null || !ctx.db().profile) return;
    const t = ctx.now().getTime();
    s.incoming = ctx
      .requesters()
      .slice(0, 2)
      .map((requester, i) => ({
        id: `pr_${s.seq++}`,
        requester,
        status: 'pending' as const,
        createdAt: new Date(t - (i + 1) * 3 * 3600_000).toISOString(),
        decidedAt: null,
      }));
  }

  return {
    stateFor(ownerId, base) {
      const s = ctx.db().photoMock;
      if (!s) return base;
      tick(s);
      return s.outgoing[ownerId]?.status === 'approved' ? 'visible' : base;
    },

    myPhotos: () => ctx.op(() => list(state())),

    uploadPhoto: (input) =>
      ctx.op(() => {
        const s = state();
        const mime = guessMime(input);
        if (!(PHOTO_MIME_TYPES as readonly string[]).includes(mime)) throw new ApiError(415, 'unsupported_type', { error: 'unsupported_type' });
        const active = sorted(s).filter((p) => p.status !== 'rejected');
        if (active.length >= PHOTO_LIMITS.maxPhotos) throw new ApiError(409, 'photo_limit', { error: 'photo_limit', max: PHOTO_LIMITS.maxPhotos });
        if (input.position !== undefined && (!Number.isInteger(input.position) || input.position < 0 || input.position >= PHOTO_LIMITS.maxPhotos)) {
          throw new ApiError(400, 'invalid_position', { error: 'invalid_position' });
        }
        const photo: MockPhoto = {
          id: `ph_${s.seq++}`,
          uri: input.uri,
          position: 0,
          status: 'pending',
          mime: mime as PhotoMime,
          // Rough size of a data: URI; native file sizes are unknown here.
          bytes: input.uri.startsWith('data:') ? Math.round(((input.uri.length - input.uri.indexOf(',') - 1) * 3) / 4) : 0,
          createdAt: ctx.now().toISOString(),
        };
        s.photos.push(photo);
        const order = active.map((p) => p.id);
        order.splice(Math.min(input.position ?? order.length, order.length), 0, photo.id);
        renumber(s, [...order, ...sorted(s).filter((p) => p.status === 'rejected').map((p) => p.id)]);
        return list(s).find((p) => p.id === photo.id)!;
      }),

    deletePhoto: (id) =>
      ctx.op(() => {
        const s = state();
        if (!s.photos.some((p) => p.id === id)) throw new ApiError(404, 'not_found', { error: 'not_found' });
        s.photos = s.photos.filter((p) => p.id !== id);
        renumber(s, sorted(s).map((p) => p.id));
      }),

    reorderPhotos: (ids) =>
      ctx.op(() => {
        const s = state();
        const current = new Set(s.photos.map((p) => p.id));
        if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((id) => current.has(id))) {
          throw new ApiError(400, 'invalid_order', { error: 'invalid_order' });
        }
        renumber(s, ids);
        return list(s);
      }),

    requestPhotoAccess: (ownerId) =>
      ctx.op(() => {
        const s = state();
        const v = view(ownerId);
        if (s.outgoing[ownerId] || v.hasAccess) return v;
        if (!v.canRequest) throw new ApiError(409, 'not_requestable', { error: 'not_requestable' });
        s.outgoing[ownerId] = { status: 'pending', at: ctx.now().toISOString() };
        return view(ownerId);
      }),

    photoAccess: (ownerId) => ctx.op(() => view(ownerId)),

    incomingPhotoRequests: () =>
      ctx.op(() => {
        const s = state();
        seedIncoming(s);
        return s.incoming ?? [];
      }),

    decidePhotoRequest: (id, decision) =>
      ctx.op(() => {
        const s = state();
        seedIncoming(s);
        const r = s.incoming?.find((x) => x.id === id);
        if (!r) throw new ApiError(404, 'not_found', { error: 'not_found' });
        if (decision === 'decline') s.incoming = (s.incoming ?? []).filter((x) => x.id !== id);
        else if (r.status !== 'approved') {
          r.status = 'approved';
          r.decidedAt = ctx.now().toISOString();
        }
      }),
  };
}
