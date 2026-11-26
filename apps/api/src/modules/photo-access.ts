/**
 * Pure photo-privacy rules + viewer-bound photo URLs, shared by PhotosService, compat.ts (cards) and
 * members.ts (MyProfile). See the visibility table in packages/core/src/photos.ts.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { asc, inArray, ne, and } from 'drizzle-orm';
import type { PhotoStatus, PhotoVisibility, ProfileCard } from '@halal-meet/core';
import type { Db } from '../db/client';
import * as t from '../db/schema';

export interface PhotoSettings {
  /** Signs viewer-bound photo URLs (the JWT secret). */
  secret: string;
  /** Pending (not yet moderated) photos are shown to others too. Default: on outside production. */
  pendingVisible: boolean;
  /** Absolute base for photo URLs (PUBLIC_API_URL); null = derived from each request's host. */
  publicBaseUrl: string | null;
}

let settings: PhotoSettings | null = null;

export function photoSettingsFromEnv(base: { jwtSecret: string; isProduction: boolean }, env: NodeJS.ProcessEnv = process.env): PhotoSettings {
  const raw = env.PHOTO_PENDING_VISIBLE?.trim().toLowerCase();
  const pendingVisible = raw === undefined || raw === '' ? !base.isProduction : raw === 'true' || raw === '1';
  return { secret: base.jwtSecret, pendingVisible, publicBaseUrl: env.PUBLIC_API_URL?.replace(/\/+$/, '') || null };
}

/** Called by PhotosService at boot (from CONFIG + env). */
export function configurePhotos(next: PhotoSettings): void {
  settings = next;
}

export function photoSettings(): PhotoSettings {
  if (!settings) {
    settings = photoSettingsFromEnv({ jwtSecret: process.env.JWT_SECRET ?? 'halal-meet-dev-secret-change-me', isProduction: process.env.NODE_ENV === 'production' });
  }
  return settings;
}

/** May others see a photo with this moderation status? */
export function isShareable(status: string): boolean {
  return status === 'approved' || (status === 'pending' && photoSettings().pendingVisible);
}

// ───────── Member photo summaries (loaded with members) ─────────

export interface MemberPhoto {
  id: string;
  position: number;
  status: PhotoStatus;
}

/** Non-rejected photos per account, main photo first. */
export async function loadPhotoSummaries(db: Db, ids: string[]): Promise<Map<string, MemberPhoto[]>> {
  const out = new Map<string, MemberPhoto[]>();
  if (ids.length === 0) return out;
  const rows = await db
    .select({ id: t.photos.id, accountId: t.photos.accountId, position: t.photos.position, status: t.photos.status })
    .from(t.photos)
    .where(and(inArray(t.photos.accountId, ids), ne(t.photos.status, 'rejected')))
    .orderBy(asc(t.photos.position), asc(t.photos.createdAt));
  for (const r of rows) {
    const list = out.get(r.accountId) ?? [];
    list.push({ id: r.id, position: r.position, status: r.status as PhotoStatus });
    out.set(r.accountId, list);
  }
  return out;
}

/** The owner's own main photo (any status but rejected). */
export function ownMainPhoto(photos: MemberPhoto[] | undefined): MemberPhoto | null {
  return photos?.[0] ?? null;
}

/** The first photo others may see (status-wise), or null. */
export function sharedMainPhoto(photos: MemberPhoto[] | undefined): MemberPhoto | null {
  return photos?.find((p) => isShareable(p.status)) ?? null;
}

// ───────── Access rules ─────────

export interface AccessFacts {
  visibility: PhotoVisibility | string;
  isOwner: boolean;
  /** Viewer is an active (accepted, not paused) guardian of the owner. */
  isGuardian: boolean;
  /** Signed in with a profile of the opposite gender, both accounts active, no block either way. */
  eligible: boolean;
  isMatch: boolean;
  /** An approved photo access request from the viewer to the owner. */
  approved: boolean;
}

/**
 * How the viewer sees the owner's photo. Only `visible` grants bytes. `blurred` = the "Request to view" /
 * "after you match" state, `locked` = family only (or not eligible at all).
 */
export function decidePhotoState(f: AccessFacts): ProfileCard['photoState'] {
  if (f.isOwner || f.isGuardian) return 'visible';
  if (!f.eligible) return 'locked';
  switch (f.visibility) {
    case 'public':
      return 'visible';
    case 'matches':
      return f.isMatch ? 'visible' : 'blurred';
    case 'request':
      return f.isMatch || f.approved ? 'visible' : 'blurred';
    case 'family':
    default:
      return 'locked';
  }
}

/** A request can only unlock `request`-level photos. */
export function canRequestFor(visibility: string): boolean {
  return visibility === 'request';
}

// ───────── Viewer-bound URLs ─────────

const URL_TTL_S = 3600;

function sign(viewerHex: string, photoId: string, exp: number): string {
  return createHmac('sha256', photoSettings().secret).update(`photo:${viewerHex}:${photoId}:${exp}`).digest().subarray(0, 16).toString('base64url');
}

/**
 * Relative URL (`/photos/<id>?t=…`) the viewer can load without a bearer header. The expiry is rounded
 * to the hour (1–2 h validity) so URLs stay stable between refetches. Access is re-checked on every fetch.
 */
export function photoPath(viewerId: string, photoId: string, nowMs = Date.now()): string {
  const viewerHex = viewerId.replace(/-/g, '').toLowerCase();
  const exp = (Math.floor(nowMs / 1000 / URL_TTL_S) + 2) * URL_TTL_S;
  return `/photos/${photoId}?t=${viewerHex}.${exp.toString(36)}.${sign(viewerHex, photoId, exp)}`;
}

/** Verifies a `t` token for this photo; returns the viewer account id or null. */
export function verifyPhotoToken(token: string | undefined, photoId: string, nowMs = Date.now()): string | null {
  if (!token) return null;
  const [viewerHex, expRaw, sig] = token.split('.');
  if (!viewerHex || !expRaw || !sig || !/^[0-9a-f]{32}$/.test(viewerHex)) return null;
  const exp = parseInt(expRaw, 36);
  if (!Number.isFinite(exp) || exp * 1000 < nowMs) return null;
  const expected = Buffer.from(sign(viewerHex, photoId, exp));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return `${viewerHex.slice(0, 8)}-${viewerHex.slice(8, 12)}-${viewerHex.slice(12, 16)}-${viewerHex.slice(16, 20)}-${viewerHex.slice(20)}`;
}
