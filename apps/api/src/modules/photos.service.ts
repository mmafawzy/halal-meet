import {
  BadRequestException,
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, ne, or } from 'drizzle-orm';
import {
  isStaffRole,
  PHOTO_LIMITS,
  type IncomingPhotoRequest,
  type Photo,
  type PhotoAccessView,
  type PhotoMime,
  type PhotoStatus,
  type ProfileCard,
} from '@halal-meet/core';
import { CONFIG, type AppConfig } from '../config';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { uuidv7, UUID_RE } from '../common/ids';
import { ageFromBirthDate } from '../common/time';
import { MembersService } from './members';
import { NotificationsService } from './notifications.service';
import {
  canRequestFor,
  configurePhotos,
  decidePhotoState,
  isShareable,
  loadPhotoSummaries,
  ownMainPhoto,
  photoPath,
  photoSettings,
  photoSettingsFromEnv,
  sharedMainPhoto,
} from './photo-access';
import { PHOTO_STORAGE, type PhotoStorage } from './storage';

/** The subset of a multer file we use (memory storage). */
export interface UploadedPhotoFile {
  buffer: Buffer;
  size: number;
  mimetype: string;
  originalname?: string;
}

const EXT: Record<PhotoMime, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heic',
};

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/** Detects the real image type from magic bytes (the client's Content-Type is not trusted). */
export function sniffImage(b: Buffer): PhotoMime | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.length >= 12 && b.toString('ascii', 4, 8) === 'ftyp' && HEIF_BRANDS.has(b.toString('ascii', 8, 12))) return 'image/heic';
  return null;
}

/** Largest side we accept as a real image dimension; anything else is a malformed or hostile header. */
const MAX_IMAGE_SIDE = 30_000;

/** Width/height for PNG and baseline/progressive JPEG (others, or implausible headers: null). */
export function imageSize(b: Buffer, mime: PhotoMime): { width: number | null; height: number | null } {
  const size = rawImageSize(b, mime);
  const ok = (n: number | null) => n !== null && Number.isInteger(n) && n > 0 && n <= MAX_IMAGE_SIDE;
  return ok(size.width) && ok(size.height) ? size : { width: null, height: null };
}

function rawImageSize(b: Buffer, mime: PhotoMime): { width: number | null; height: number | null } {
  try {
    if (mime === 'image/png' && b.length >= 24) return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
    if (mime === 'image/jpeg') {
      let i = 2;
      while (i + 9 < b.length) {
        if (b[i] !== 0xff) return { width: null, height: null };
        const marker = b[i + 1]!;
        const len = b.readUInt16BE(i + 2);
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: b.readUInt16BE(i + 7), height: b.readUInt16BE(i + 5) };
        }
        i += 2 + len;
      }
    }
  } catch {
    /* malformed header: sizes are optional */
  }
  return { width: null, height: null };
}

interface OwnerAccess {
  ownerId: string;
  visibility: string;
  state: ProfileCard['photoState'];
  /** First photo others may see (status-wise); null = no photo to show. */
  sharedPhotoId: string | null;
  eligible: boolean;
  isMatch: boolean;
  approved: boolean;
  isGuardian: boolean;
}

function accountActive(a: { status: string; suspendedUntil: Date | null }, now: Date): boolean {
  if (a.status === 'banned' || a.status === 'deleted' || a.status === 'suspended') return false;
  return !(a.suspendedUntil && a.suspendedUntil > now);
}

@Injectable()
export class PhotosService {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(CONFIG) config: AppConfig,
    @Inject(PHOTO_STORAGE) private readonly storage: PhotoStorage,
    @Inject(MembersService) private readonly members: MembersService,
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
  ) {
    configurePhotos(photoSettingsFromEnv(config));
  }

  // ───────── Own photos ─────────

  private toPhoto(r: typeof t.photos.$inferSelect, ownerId: string, mainId: string | null): Photo {
    return {
      id: r.id,
      url: photoPath(ownerId, r.id),
      position: r.position,
      status: r.status as PhotoStatus,
      mime: r.mime as PhotoMime,
      bytes: r.bytes,
      isMain: r.id === mainId,
      createdAt: r.createdAt.toISOString(),
    };
  }

  private async rows(ownerId: string) {
    return this.db
      .select()
      .from(t.photos)
      .where(eq(t.photos.accountId, ownerId))
      .orderBy(asc(t.photos.position), asc(t.photos.createdAt));
  }

  async list(ownerId: string): Promise<Photo[]> {
    const rows = await this.rows(ownerId);
    const main = rows.find((r) => r.status !== 'rejected')?.id ?? null;
    return rows.map((r) => this.toPhoto(r, ownerId, main));
  }

  async upload(ownerId: string, file: UploadedPhotoFile | undefined, positionRaw?: unknown): Promise<Photo> {
    if (!file || !file.buffer?.length) throw new BadRequestException({ error: 'file_required' });
    if (file.size > PHOTO_LIMITS.maxBytes || file.buffer.length > PHOTO_LIMITS.maxBytes) {
      throw new HttpException({ error: 'file_too_large', maxBytes: PHOTO_LIMITS.maxBytes }, HttpStatus.PAYLOAD_TOO_LARGE);
    }
    const mime = sniffImage(file.buffer);
    if (!mime) throw new HttpException({ error: 'unsupported_type', allowed: ['jpeg', 'png', 'webp', 'heic'] }, HttpStatus.UNSUPPORTED_MEDIA_TYPE);

    let position: number | null = null;
    if (positionRaw !== undefined && positionRaw !== null && positionRaw !== '') {
      const n = Number(positionRaw);
      if (!Number.isInteger(n) || n < 0 || n >= PHOTO_LIMITS.maxPhotos) throw new BadRequestException({ error: 'invalid_position' });
      position = n;
    }

    const existing = (await this.rows(ownerId)).filter((r) => r.status !== 'rejected');
    if (existing.length >= PHOTO_LIMITS.maxPhotos) throw new ConflictException({ error: 'photo_limit', max: PHOTO_LIMITS.maxPhotos });

    const id = uuidv7();
    const storageKey = `${ownerId}/${id}.${EXT[mime]}`;
    await this.storage.put(storageKey, file.buffer, mime);
    const { width, height } = imageSize(file.buffer, mime);
    const at = Math.min(position ?? existing.length, existing.length);
    await this.db.insert(t.photos).values({ id, accountId: ownerId, storageKey, mime, bytes: file.buffer.length, width, height, position: at, status: 'pending' });
    const order = existing.map((r) => r.id);
    order.splice(at, 0, id);
    await this.writeOrder(ownerId, order);
    await this.syncProfile(ownerId);
    const list = await this.list(ownerId);
    return list.find((p) => p.id === id)!;
  }

  async remove(ownerId: string, photoId: string): Promise<void> {
    if (!UUID_RE.test(photoId)) throw new NotFoundException({ error: 'not_found' });
    const [row] = await this.db.select().from(t.photos).where(and(eq(t.photos.id, photoId), eq(t.photos.accountId, ownerId)));
    if (!row) throw new NotFoundException({ error: 'not_found' });
    await this.db.delete(t.photos).where(eq(t.photos.id, photoId));
    await this.storage.delete(row.storageKey);
    const rest = (await this.rows(ownerId)).map((r) => r.id);
    await this.writeOrder(ownerId, rest);
    await this.syncProfile(ownerId);
  }

  async reorder(ownerId: string, ids: string[]): Promise<Photo[]> {
    const rows = await this.rows(ownerId);
    const current = new Set(rows.map((r) => r.id));
    if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((id) => current.has(id))) {
      throw new BadRequestException({ error: 'invalid_order', message: 'Send every photo id exactly once, main photo first.' });
    }
    await this.writeOrder(ownerId, ids);
    await this.syncProfile(ownerId);
    return this.list(ownerId);
  }

  private async writeOrder(ownerId: string, ids: string[]): Promise<void> {
    for (const [i, id] of ids.entries()) {
      await this.db.update(t.photos).set({ position: i }).where(and(eq(t.photos.id, id), eq(t.photos.accountId, ownerId)));
    }
  }

  /** Keeps profiles.photo_url (used for profile strength) pointing at the main photo. */
  async syncProfile(ownerId: string): Promise<void> {
    const main = ownMainPhoto((await loadPhotoSummaries(this.db, [ownerId])).get(ownerId));
    const updated = await this.db
      .update(t.profiles)
      .set({ photoUrl: main ? `/photos/${main.id}` : null })
      .where(eq(t.profiles.accountId, ownerId))
      .returning({ id: t.profiles.accountId });
    if (updated.length) await this.members.refreshStrength(ownerId);
  }

  // ───────── Access ─────────

  /**
   * Resolves how `viewerId` sees each owner's photo, in a handful of batched queries.
   * Owners without a profile are absent from the map.
   */
  async resolve(viewerId: string, ownerIds: string[], now = new Date()): Promise<Map<string, OwnerAccess>> {
    const ids = [...new Set(ownerIds)].filter((id) => UUID_RE.test(id));
    const out = new Map<string, OwnerAccess>();
    if (ids.length === 0) return out;
    const others = ids.filter((id) => id !== viewerId);

    const [owners, viewerRows, photosBy, matchRows, approvedRows, guardianRows, blockRows] = await Promise.all([
      this.db
        .select({
          id: t.profiles.accountId,
          gender: t.profiles.gender,
          visibility: t.profiles.photoVisibility,
          status: t.accounts.status,
          suspendedUntil: t.accounts.suspendedUntil,
        })
        .from(t.profiles)
        .innerJoin(t.accounts, eq(t.accounts.id, t.profiles.accountId))
        .where(inArray(t.profiles.accountId, ids)),
      this.db
        .select({ status: t.accounts.status, suspendedUntil: t.accounts.suspendedUntil, gender: t.profiles.gender })
        .from(t.accounts)
        .leftJoin(t.profiles, eq(t.profiles.accountId, t.accounts.id))
        .where(eq(t.accounts.id, viewerId)),
      loadPhotoSummaries(this.db, ids),
      others.length
        ? this.db
            .select({ aId: t.matches.aId, bId: t.matches.bId })
            .from(t.matches)
            .where(
              and(
                eq(t.matches.status, 'active'),
                or(and(eq(t.matches.aId, viewerId), inArray(t.matches.bId, others)), and(eq(t.matches.bId, viewerId), inArray(t.matches.aId, others))),
              ),
            )
        : Promise.resolve([]),
      others.length
        ? this.db
            .select({ ownerId: t.photoAccessRequests.ownerId })
            .from(t.photoAccessRequests)
            .where(and(eq(t.photoAccessRequests.requesterId, viewerId), inArray(t.photoAccessRequests.ownerId, others), eq(t.photoAccessRequests.status, 'approved')))
        : Promise.resolve([]),
      others.length
        ? this.db
            .select({ memberId: t.guardianships.memberId })
            .from(t.guardianships)
            .where(and(eq(t.guardianships.guardianId, viewerId), inArray(t.guardianships.memberId, others), eq(t.guardianships.status, 'active')))
        : Promise.resolve([]),
      others.length
        ? this.db
            .select({ blockerId: t.blocks.blockerId, blockedId: t.blocks.blockedId })
            .from(t.blocks)
            .where(
              or(and(eq(t.blocks.blockerId, viewerId), inArray(t.blocks.blockedId, others)), and(eq(t.blocks.blockedId, viewerId), inArray(t.blocks.blockerId, others))),
            )
        : Promise.resolve([]),
    ]);

    const viewer = viewerRows[0];
    const viewerOk = !!viewer && accountActive(viewer, now);
    const matched = new Set(matchRows.map((r) => (r.aId === viewerId ? r.bId : r.aId)));
    const approved = new Set(approvedRows.map((r) => r.ownerId));
    const guarded = new Set(guardianRows.map((r) => r.memberId));
    const blocked = new Set(blockRows.map((r) => (r.blockerId === viewerId ? r.blockedId : r.blockerId)));

    for (const o of owners) {
      const isOwner = o.id === viewerId;
      const ownerOk = accountActive(o, now);
      const notBlocked = !blocked.has(o.id);
      const isGuardian = !isOwner && viewerOk && ownerOk && notBlocked && guarded.has(o.id);
      const eligible = viewerOk && ownerOk && notBlocked && !!viewer?.gender && viewer.gender !== o.gender;
      const facts = { isOwner, isGuardian, eligible, isMatch: matched.has(o.id), approved: approved.has(o.id), visibility: o.visibility };
      const photos = photosBy.get(o.id);
      const shared = isOwner ? ownMainPhoto(photos) : sharedMainPhoto(photos);
      out.set(o.id, {
        ownerId: o.id,
        visibility: o.visibility,
        // No photo → 'visible' (the client shows initials).
        state: shared ? decidePhotoState(facts) : 'visible',
        sharedPhotoId: shared?.id ?? null,
        eligible,
        isMatch: facts.isMatch,
        approved: facts.approved,
        isGuardian,
      });
    }
    return out;
  }

  /** Bytes for GET /photos/:id, or null (→ 404) when the viewer may not see it or it does not exist. */
  async serve(viewerId: string, photoId: string): Promise<{ bytes: Buffer; mime: string } | null> {
    if (!UUID_RE.test(photoId)) return null;
    const [row] = await this.db.select().from(t.photos).where(eq(t.photos.id, photoId));
    if (!row) return null;
    let allowed = row.accountId === viewerId;
    if (!allowed) {
      const [viewer] = await this.db.select({ role: t.accounts.role }).from(t.accounts).where(eq(t.accounts.id, viewerId));
      // Moderators review photos (including pending and rejected ones) in the admin console.
      if (viewer && isStaffRole(viewer.role)) allowed = true;
    }
    if (!allowed && isShareable(row.status)) {
      const access = (await this.resolve(viewerId, [row.accountId])).get(row.accountId);
      allowed = access?.state === 'visible' && access.sharedPhotoId !== null;
    }
    if (!allowed) return null;
    const bytes = await this.storage.get(row.storageKey);
    return bytes ? { bytes, mime: row.mime } : null;
  }

  // ───────── Access requests ─────────

  private view(ownerId: string, access: OwnerAccess | undefined, row: { status: string } | undefined): PhotoAccessView {
    const hasAccess = !!access && access.sharedPhotoId !== null && access.state === 'visible';
    const canRequest = !!access && access.eligible && access.sharedPhotoId !== null && canRequestFor(access.visibility) && !hasAccess;
    // Declining is silent: the requester keeps seeing "pending".
    const status = row ? (row.status === 'approved' && hasAccess ? 'approved' : 'pending') : 'none';
    return { ownerId, status, canRequest, hasAccess };
  }

  async accessView(viewerId: string, ownerId: string): Promise<PhotoAccessView> {
    if (!UUID_RE.test(ownerId) || ownerId === viewerId) throw new NotFoundException({ error: 'not_found' });
    const access = (await this.resolve(viewerId, [ownerId])).get(ownerId);
    if (!access || !access.eligible) throw new NotFoundException({ error: 'not_found' });
    const [row] = await this.db
      .select({ status: t.photoAccessRequests.status })
      .from(t.photoAccessRequests)
      .where(and(eq(t.photoAccessRequests.requesterId, viewerId), eq(t.photoAccessRequests.ownerId, ownerId)));
    return this.view(ownerId, access, row);
  }

  async request(viewerId: string, ownerId: string, now = new Date()): Promise<PhotoAccessView> {
    if (ownerId === viewerId) throw new BadRequestException({ error: 'cannot_request_self' });
    if (!UUID_RE.test(ownerId)) throw new NotFoundException({ error: 'not_found' });
    const access = (await this.resolve(viewerId, [ownerId], now)).get(ownerId);
    if (!access || !access.eligible) throw new NotFoundException({ error: 'not_found' });

    const [existing] = await this.db
      .select({ status: t.photoAccessRequests.status })
      .from(t.photoAccessRequests)
      .where(and(eq(t.photoAccessRequests.requesterId, viewerId), eq(t.photoAccessRequests.ownerId, ownerId)));
    const current = this.view(ownerId, access, existing);
    // One request per pair: repeating it is a no-op (a declined request is never re-sent).
    if (existing || current.hasAccess) return current;
    if (!current.canRequest) throw new ConflictException({ error: 'not_requestable' });

    const [{ n } = { n: 0 }] = await this.db
      .select({ n: count() })
      .from(t.photoAccessRequests)
      .where(and(eq(t.photoAccessRequests.requesterId, viewerId), gt(t.photoAccessRequests.createdAt, new Date(now.getTime() - 86_400_000))));
    if (Number(n) >= PHOTO_LIMITS.requestsPerDay) {
      throw new HttpException({ error: 'rate_limited', limit: PHOTO_LIMITS.requestsPerDay }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const id = uuidv7();
    const inserted = await this.db
      .insert(t.photoAccessRequests)
      .values({ id, requesterId: viewerId, ownerId, status: 'pending' })
      .onConflictDoNothing()
      .returning({ id: t.photoAccessRequests.id });
    if (inserted.length) await this.notifications.notify(ownerId, 'photo_request', { requestId: id, requesterId: viewerId });
    return { ownerId, status: 'pending', canRequest: false, hasAccess: false };
  }

  async incoming(ownerId: string, now = new Date()): Promise<IncomingPhotoRequest[]> {
    const rows = await this.db
      .select({
        id: t.photoAccessRequests.id,
        status: t.photoAccessRequests.status,
        createdAt: t.photoAccessRequests.createdAt,
        decidedAt: t.photoAccessRequests.decidedAt,
        requesterId: t.photoAccessRequests.requesterId,
        firstName: t.profiles.firstName,
        gender: t.profiles.gender,
        birthDate: t.profiles.birthDate,
        country: t.profiles.country,
        city: t.profiles.city,
      })
      .from(t.photoAccessRequests)
      .innerJoin(t.profiles, eq(t.profiles.accountId, t.photoAccessRequests.requesterId))
      .where(and(eq(t.photoAccessRequests.ownerId, ownerId), ne(t.photoAccessRequests.status, 'declined')))
      .orderBy(desc(t.photoAccessRequests.createdAt));
    if (rows.length === 0) return [];
    // The requester's own photo follows the requester's visibility, as seen by the owner.
    const access = await this.resolve(
      ownerId,
      rows.map((r) => r.requesterId),
      now,
    );
    const list: IncomingPhotoRequest[] = [];
    for (const r of rows) {
      const a = access.get(r.requesterId);
      if (!a || !a.eligible) continue; // blocked, suspended or gone
      list.push({
        id: r.id,
        status: r.status as IncomingPhotoRequest['status'],
        createdAt: r.createdAt.toISOString(),
        decidedAt: r.decidedAt ? r.decidedAt.toISOString() : null,
        requester: {
          id: r.requesterId,
          firstName: r.firstName,
          gender: r.gender as 'male' | 'female',
          age: ageFromBirthDate(r.birthDate, now),
          country: r.country,
          city: r.city,
          photoUrl: a.state === 'visible' && a.sharedPhotoId ? photoPath(ownerId, a.sharedPhotoId) : null,
          photoState: a.state,
        },
      });
    }
    return list;
  }

  async decide(ownerId: string, requestId: string, decision: 'approve' | 'decline'): Promise<{ ok: true; status: 'approved' | 'declined' }> {
    if (!UUID_RE.test(requestId)) throw new NotFoundException({ error: 'not_found' });
    const [row] = await this.db
      .select()
      .from(t.photoAccessRequests)
      .where(and(eq(t.photoAccessRequests.id, requestId), eq(t.photoAccessRequests.ownerId, ownerId)));
    if (!row) throw new NotFoundException({ error: 'not_found' });
    const status = decision === 'approve' ? 'approved' : 'declined';
    if (row.status !== status) {
      await this.db.update(t.photoAccessRequests).set({ status, decidedAt: new Date() }).where(eq(t.photoAccessRequests.id, requestId));
      // Declining (or revoking) is silent; only an approval tells the requester.
      if (status === 'approved') await this.notifications.notify(row.requesterId, 'photo_approved', { requestId, ownerId });
    }
    return { ok: true, status };
  }

  // ───────── Response decoration (PhotoCardsInterceptor) ─────────

  /**
   * Rewrites every ProfileCard-shaped object (`id` + `photoUrl` + `photoState`) in a response for the
   * viewer, then makes every `/photos/…` path absolute. Cards are built without knowing the viewer, so
   * this is where request approvals and guardianships are applied and URLs are signed.
   */
  async decorate(body: unknown, viewerId: string, origin: string): Promise<void> {
    const cards: Array<Record<string, unknown>> = [];
    const paths: Array<{ obj: Record<string, unknown>; key: string }> = [];
    const seen = new Set<unknown>();
    const walk = (v: unknown, depth: number) => {
      if (!v || typeof v !== 'object' || depth > 12 || seen.has(v) || Buffer.isBuffer(v) || v instanceof Date) return;
      seen.add(v);
      if (Array.isArray(v)) {
        for (const x of v) walk(x, depth + 1);
        return;
      }
      const o = v as Record<string, unknown>;
      if (typeof o.id === 'string' && 'photoUrl' in o && 'photoState' in o) cards.push(o);
      for (const [k, x] of Object.entries(o)) {
        if ((k === 'photoUrl' || k === 'url') && typeof x === 'string' && x.startsWith('/photos/')) paths.push({ obj: o, key: k });
        else walk(x, depth + 1);
      }
    };
    walk(body, 0);

    if (cards.length) {
      const access = await this.resolve(
        viewerId,
        cards.map((c) => c.id as string),
      );
      for (const c of cards) {
        const a = access.get(c.id as string);
        if (!a) continue;
        c.photoState = a.state;
        c.photoUrl = a.state === 'visible' && a.sharedPhotoId ? photoPath(viewerId, a.sharedPhotoId) : null;
        if (typeof c.photoUrl === 'string') paths.push({ obj: c, key: 'photoUrl' });
      }
    }
    const base = photoSettings().publicBaseUrl ?? origin;
    for (const { obj, key } of paths) {
      const v = obj[key];
      if (typeof v === 'string' && v.startsWith('/photos/')) obj[key] = `${base}${v}`;
    }
  }
}
