/**
 * Photos & photo privacy (spec 01 §10, §21–23, §41).
 *
 * Who may see a member's photos is decided by the owner's `photoVisibility` (ProfileInput):
 * - `public`  → any signed-in, eligible member (opposite gender, not blocked)
 * - `matches` → only people with an active match
 * - `request` → an approved photo access request, or an active match
 * - `family`  → only the owner's active guardians
 * The owner always sees their own photos, and active guardians see them at every level.
 * Anyone else gets HTTP 404 from `GET /photos/:id` — the server never reveals whether a photo exists.
 *
 * Photo URLs in API responses (`ProfileCard.photoUrl`, `MyProfile.photoUrl`, `Photo.url`) are absolute,
 * short-lived and bound to the viewer (a signed `t` query parameter), so they work in `<Image>` without
 * an Authorization header. They are `null` whenever the viewer may not see the photo.
 */

export type PhotoStatus = 'pending' | 'approved' | 'rejected';

export const PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const;
export type PhotoMime = (typeof PHOTO_MIME_TYPES)[number];

export const PHOTO_LIMITS = {
  /** 1 main photo + up to 5 more (spec 01 §10). */
  maxPhotos: 6,
  maxBytes: 8 * 1024 * 1024,
  /** New photo access requests a member may send per rolling 24 h. */
  requestsPerDay: 20,
} as const;

/** One of the signed-in member's own photos. Position 0 is the main photo. */
export interface Photo {
  id: string;
  /** Viewer-bound URL of the image bytes (owner can always load it, whatever the status). */
  url: string;
  position: number;
  /**
   * Moderation status. `pending` photos are shown to the owner only, unless the server runs with
   * PHOTO_PENDING_VISIBLE (default outside production, so the demo works). `rejected` photos are never shown to others.
   */
  status: PhotoStatus;
  mime: PhotoMime;
  bytes: number;
  isMain: boolean;
  createdAt: string;
}

/** PUT /me/photos/order — every current photo id, main photo first. */
export interface PhotoOrderBody {
  ids: string[];
}

/** POST /photos/requests */
export interface PhotoAccessRequestBody {
  ownerId: string;
}

/**
 * The requester's view of a request. A declined request stays `pending` for the requester:
 * declining is silent (spec 01 §41).
 */
export type PhotoAccessStatus = 'none' | 'pending' | 'approved';

export interface PhotoAccessView {
  ownerId: string;
  status: PhotoAccessStatus;
  /** False when a request cannot unlock the photo (owner shares with matches or family only, or there is no photo). */
  canRequest: boolean;
  /** True when the viewer already sees the photo (match, public, approved, guardian). */
  hasAccess: boolean;
}

/** A small, privacy-safe summary of the person asking (their own photo follows their own visibility). */
export interface PhotoRequester {
  id: string;
  firstName: string;
  gender: 'male' | 'female';
  age: number;
  country: string;
  city: string;
  photoUrl: string | null;
  photoState: 'visible' | 'blurred' | 'locked';
}

/** Owner side: GET /photos/requests/incoming (pending + approved; declined ones drop out). */
export interface IncomingPhotoRequest {
  id: string;
  requester: PhotoRequester;
  status: 'pending' | 'approved';
  createdAt: string;
  decidedAt: string | null;
}

/** PUT /photos/requests/:id — `decline` on an approved request revokes it (grants are revocable, §41). */
export interface PhotoRequestDecisionBody {
  decision: 'approve' | 'decline';
}

export const PHOTO_ROUTES = {
  myPhotos: 'GET /me/photos',
  uploadPhoto: 'POST /me/photos (multipart/form-data: file, position?)',
  deletePhoto: 'DELETE /me/photos/:id',
  reorderPhotos: 'PUT /me/photos/order',
  photo: 'GET /photos/:id?t= (bearer token or signed t)',
  requestPhotoAccess: 'POST /photos/requests',
  photoAccess: 'GET /photos/requests/outgoing/:ownerId',
  incomingPhotoRequests: 'GET /photos/requests/incoming',
  decidePhotoRequest: 'PUT /photos/requests/:id',
} as const;
