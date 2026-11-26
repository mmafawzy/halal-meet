import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { defaultGuardianPermissions, PHOTO_LIMITS } from '@halal-meet/core';
import * as t from '../src/db/schema';
import { uuidv7 } from '../src/common/ids';
import { configurePhotos, photoPath, photoSettings, photoSettingsFromEnv, verifyPhotoToken } from '../src/modules/photo-access';
import { imageSize, sniffImage } from '../src/modules/photos.service';
import { COMPATIBLE_ANSWERS } from './fixtures';
import { createMember, createTestApp, login, truncateAll, type TestContext } from './helpers';

let ctx: TestContext;
const photoDir = mkdtempSync(path.join(tmpdir(), 'hm-photos-'));

beforeAll(async () => {
  process.env.PHOTO_STORAGE = 'local';
  process.env.PHOTO_DIR = photoDir;
  ctx = await createTestApp();
});
afterAll(async () => {
  await ctx.close();
  rmSync(photoDir, { recursive: true, force: true });
});
beforeEach(async () => {
  await truncateAll(ctx.db);
  configurePhotos({ ...photoSettings(), pendingVisible: true });
});

const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

// ───────── tiny but valid-looking images ─────────
function png(width = 300, height = 400): Buffer {
  const b = Buffer.alloc(40);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}
const jpeg = () => Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const webp = () => Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x1a, 0, 0, 0]), Buffer.from('WEBPVP8 '), Buffer.alloc(16)]);
const heic = () => Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypheic'), Buffer.alloc(16)]);
const gif = () => Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00', 'binary');

function upload(token: string, bytes: Buffer = png(), opts: { filename?: string; contentType?: string; position?: number } = {}) {
  const req = ctx.http.post('/me/photos').set(auth(token));
  if (opts.position !== undefined) req.field('position', String(opts.position));
  return req.attach('file', bytes, { filename: opts.filename ?? 'photo.png', contentType: opts.contentType ?? 'image/png' });
}

/** Path + query of an absolute photo URL from a response. */
const rel = (url: string) => {
  const u = new URL(url);
  return `${u.pathname}${u.search}`;
};

async function match(aId: string, bId: string, status: 'active' | 'closed' = 'active') {
  await ctx.db.insert(t.matches).values({ id: uuidv7(), aId, bId, stage: 2, status });
}

/** Sara (with one photo at `visibility`) and Ahmed, a compatible stranger. */
async function pair(visibility: 'public' | 'matches' | 'request' | 'family') {
  const sara = await createMember(ctx, { gender: 'female', answers: COMPATIBLE_ANSWERS, photoVisibility: visibility });
  const ahmed = await createMember(ctx, { gender: 'male', answers: COMPATIBLE_ANSWERS });
  const saraToken = await login(ctx, sara.phone);
  const ahmedToken = await login(ctx, ahmed.phone);
  const up = await upload(saraToken).expect(201);
  return { sara, ahmed, saraToken, ahmedToken, photoId: up.body.id as string };
}

async function addGuardian(memberToken: string, phone = '+201099000123') {
  const invite = await ctx.http
    .post('/guardians')
    .set(auth(memberToken))
    .send({ name: 'Baba', relationship: 'father', permissions: defaultGuardianPermissions('wali') })
    .expect(201);
  const guardianToken = await login(ctx, phone);
  await ctx.http.post(`/guardian-invites/${invite.body.inviteCode}/accept`).set(auth(guardianToken)).expect(200);
  return { guardianToken, guardianId: invite.body.guardian.id as string };
}

describe('photos: helpers', () => {
  it('sniffs real image types and reads PNG sizes', () => {
    expect(sniffImage(png())).toBe('image/png');
    expect(sniffImage(jpeg())).toBe('image/jpeg');
    expect(sniffImage(webp())).toBe('image/webp');
    expect(sniffImage(heic())).toBe('image/heic');
    expect(sniffImage(gif())).toBeNull();
    expect(sniffImage(Buffer.from('<svg/>'))).toBeNull();
    expect(imageSize(png(320, 480), 'image/png')).toEqual({ width: 320, height: 480 });
  });

  it('accepts a malformed header with absurd dimensions without a server error', async () => {
    expect(imageSize(png(3_350_162_217, 480), 'image/png')).toEqual({ width: null, height: null });
    expect(imageSize(png(0, 480), 'image/png')).toEqual({ width: null, height: null });
    const m = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, m.phone);
    const res = await ctx.http.post('/me/photos').set('Authorization', `Bearer ${token}`).attach('file', png(3_350_162_217, 1_672_526_963), 'x.png').expect(201);
    const [row] = await ctx.db.select().from(t.photos).where(eq(t.photos.id, res.body.id));
    expect(row).toMatchObject({ width: null, height: null });
  });

  it('signs viewer-bound URLs that expire and are bound to one photo', () => {
    const viewer = uuidv7();
    const photo = uuidv7();
    const now = Date.now();
    const token = new URL(`http://x${photoPath(viewer, photo, now)}`).searchParams.get('t')!;
    expect(verifyPhotoToken(token, photo, now)).toBe(viewer);
    expect(verifyPhotoToken(token, uuidv7(), now)).toBeNull();
    expect(verifyPhotoToken(token, photo, now + 3 * 3600_000)).toBeNull();
    expect(verifyPhotoToken(`${token.slice(0, -2)}xx`, photo, now)).toBeNull();
    // Stable within the hour, so refetches don't churn image caches.
    expect(photoPath(viewer, photo, now)).toBe(photoPath(viewer, photo, now + 1000));
  });

  it('shows pending photos to others only outside production unless PHOTO_PENDING_VISIBLE says otherwise', () => {
    expect(photoSettingsFromEnv({ jwtSecret: 's', isProduction: false }, {}).pendingVisible).toBe(true);
    expect(photoSettingsFromEnv({ jwtSecret: 's', isProduction: true }, {}).pendingVisible).toBe(false);
    expect(photoSettingsFromEnv({ jwtSecret: 's', isProduction: true }, { PHOTO_PENDING_VISIBLE: 'true' }).pendingVisible).toBe(true);
    expect(photoSettingsFromEnv({ jwtSecret: 's', isProduction: false }, { PHOTO_PENDING_VISIBLE: 'false' }).pendingVisible).toBe(false);
  });
});

describe('photos: own photos', () => {
  it('uploads, lists, stores on disk, sets the main photo and the profile photo', async () => {
    const sara = await createMember(ctx, { gender: 'female', profileStrength: 0 });
    const token = await login(ctx, sara.phone);

    const first = await upload(token, jpeg(), { filename: 'a.jpg', contentType: 'image/jpeg' }).expect(201);
    expect(first.body).toMatchObject({ position: 0, status: 'pending', mime: 'image/jpeg', isMain: true });
    expect(first.body.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/photos\/[0-9a-f-]{36}\?t=/);
    await upload(token, webp(), { filename: 'b.webp', contentType: 'image/webp' }).expect(201);
    await upload(token, heic(), { filename: 'c.heic', contentType: 'image/heic' }).expect(201);

    const list = await ctx.http.get('/me/photos').set(auth(token)).expect(200);
    expect(list.body.map((p: { mime: string }) => p.mime)).toEqual(['image/jpeg', 'image/webp', 'image/heic']);
    expect(list.body.map((p: { position: number }) => p.position)).toEqual([0, 1, 2]);

    const [row] = await ctx.db.select().from(t.photos).where(eq(t.photos.id, first.body.id));
    expect(existsSync(path.join(photoDir, ...row!.storageKey.split('/')))).toBe(true);

    const [profile] = await ctx.db.select().from(t.profiles).where(eq(t.profiles.accountId, sara.id));
    expect(profile!.photoUrl).toBe(`/photos/${first.body.id}`);

    const me = await ctx.http.get('/me').set(auth(token)).expect(200);
    expect(me.body.profile.photoUrl).toContain(`/photos/${first.body.id}?t=`);
    const bytes = await ctx.http.get(rel(me.body.profile.photoUrl)).expect(200);
    expect(bytes.headers['content-type']).toBe('image/jpeg');
    expect(Buffer.compare(bytes.body as Buffer, jpeg())).toBe(0);
  });

  it('inserts at a position, reorders (main first) and deletes from disk', async () => {
    const sara = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, sara.phone);
    const a = (await upload(token).expect(201)).body.id as string;
    const b = (await upload(token).expect(201)).body.id as string;
    const c = (await upload(token, png(), { position: 0 }).expect(201)).body.id as string;
    let list = await ctx.http.get('/me/photos').set(auth(token)).expect(200);
    expect(list.body.map((p: { id: string }) => p.id)).toEqual([c, a, b]);

    const reordered = await ctx.http.put('/me/photos/order').set(auth(token)).send({ ids: [b, c, a] }).expect(200);
    expect(reordered.body.map((p: { id: string; isMain: boolean }) => [p.id, p.isMain])).toEqual([
      [b, true],
      [c, false],
      [a, false],
    ]);
    const [profile] = await ctx.db.select().from(t.profiles).where(eq(t.profiles.accountId, sara.id));
    expect(profile!.photoUrl).toBe(`/photos/${b}`);

    const [row] = await ctx.db.select().from(t.photos).where(eq(t.photos.id, b));
    await ctx.http.delete(`/me/photos/${b}`).set(auth(token)).expect(200);
    expect(existsSync(path.join(photoDir, ...row!.storageKey.split('/')))).toBe(false);
    list = await ctx.http.get('/me/photos').set(auth(token)).expect(200);
    expect(list.body.map((p: { id: string; position: number }) => [p.id, p.position])).toEqual([
      [c, 0],
      [a, 1],
    ]);
    await ctx.http.get(`/photos/${b}`).set(auth(token)).expect(404);
  });

  it('validates files, limits and ownership', async () => {
    const sara = await createMember(ctx, { gender: 'female' });
    const token = await login(ctx, sara.phone);
    const other = await createMember(ctx, { gender: 'female' });
    const otherToken = await login(ctx, other.phone);

    const none = await ctx.http.post('/me/photos').set(auth(token)).field('position', '0').expect(400);
    expect(none.body.error).toBe('file_required');
    expect((await upload(token, gif(), { filename: 'x.gif', contentType: 'image/gif' }).expect(415)).body.error).toBe('unsupported_type');
    // A text file claiming to be a PNG is rejected by its bytes.
    expect((await upload(token, Buffer.from('hello world, not an image'), { contentType: 'image/png' }).expect(415)).body.error).toBe('unsupported_type');
    const big = Buffer.concat([png(), Buffer.alloc(PHOTO_LIMITS.maxBytes)]);
    await upload(token, big).expect(413);
    expect((await upload(token, png(), { position: 9 }).expect(400)).body.error).toBe('invalid_position');
    await ctx.http.post('/me/photos').expect(401);

    const ids: string[] = [];
    for (let i = 0; i < PHOTO_LIMITS.maxPhotos; i++) ids.push((await upload(token).expect(201)).body.id);
    const over = await upload(token).expect(409);
    expect(over.body).toMatchObject({ error: 'photo_limit', max: 6 });

    // Order must list every photo exactly once.
    await ctx.http.put('/me/photos/order').set(auth(token)).send({ ids: ids.slice(1) }).expect(400);
    await ctx.http.put('/me/photos/order').set(auth(token)).send({ ids: [ids[0], ids[0], ...ids.slice(2)] }).expect(400);
    await ctx.http.put('/me/photos/order').set(auth(token)).send({ ids: ['nope'] }).expect(400);

    // Someone else's photo cannot be deleted (and looks like it does not exist).
    await ctx.http.delete(`/me/photos/${ids[0]}`).set(auth(otherToken)).expect(404);
    await ctx.http.delete('/me/photos/not-a-uuid').set(auth(token)).expect(404);
  });

  it('rejected photos stop counting, are hidden from others and skipped as the main photo', async () => {
    const { sara, ahmedToken, saraToken, photoId } = await pair('public');
    const second = (await upload(saraToken).expect(201)).body.id as string;
    await ctx.db.update(t.photos).set({ status: 'rejected' }).where(eq(t.photos.id, photoId));

    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    await ctx.http.get(`/photos/${photoId}`).set(auth(saraToken)).expect(200); // the owner still sees it (with its status)
    const card = await ctx.http.get(`/profiles/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(card.body.photoUrl).toContain(`/photos/${second}?t=`);
    const list = await ctx.http.get('/me/photos').set(auth(saraToken)).expect(200);
    expect(list.body.find((p: { id: string }) => p.id === photoId)).toMatchObject({ status: 'rejected', isMain: false });
  });
});

describe('photos: GET /photos/:id access rules', () => {
  it('needs a bearer token or a signed t; never reveals whether a photo exists', async () => {
    const { photoId, ahmedToken } = await pair('family');
    await ctx.http.get(`/photos/${photoId}`).expect(401);
    await ctx.http.get(`/photos/${photoId}?t=garbage`).expect(401);
    const hidden = await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    const missing = await ctx.http.get(`/photos/${uuidv7()}`).set(auth(ahmedToken)).expect(404);
    expect(hidden.body).toEqual(missing.body);
    await ctx.http.get('/photos/not-a-uuid').set(auth(ahmedToken)).expect(404);
  });

  it('public: any signed-in member of the opposite gender; not the same gender, not when blocked', async () => {
    const { sara, ahmed, photoId, ahmedToken } = await pair('public');
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(200);
    const card = await ctx.http.get(`/profiles/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(card.body.photoState).toBe('visible');
    expect(card.body.photoUrl).toContain(`/photos/${photoId}?t=`);
    // The signed URL works without a header (as <Image> loads it), and only for that viewer's photo.
    await ctx.http.get(rel(card.body.photoUrl)).expect(200);

    const layla = await createMember(ctx, { gender: 'female' });
    const laylaToken = await login(ctx, layla.phone);
    await ctx.http.get(`/photos/${photoId}`).set(auth(laylaToken)).expect(404);

    await ctx.db.insert(t.blocks).values({ blockerId: sara.id, blockedId: ahmed.id });
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    await ctx.http.get(rel(card.body.photoUrl)).expect(404); // re-checked on every fetch
  });

  it('matches: only an active match', async () => {
    const { sara, ahmed, photoId, ahmedToken } = await pair('matches');
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    const before = await ctx.http.get(`/profiles/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(before.body).toMatchObject({ photoState: 'blurred', photoUrl: null });

    await match(sara.id, ahmed.id);
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(200);
    const matches = await ctx.http.get('/matches').set(auth(ahmedToken)).expect(200);
    const list = Array.isArray(matches.body) ? matches.body : matches.body.matches;
    expect(list[0].other.photoState).toBe('visible');
    expect(list[0].other.photoUrl).toContain(`/photos/${photoId}?t=`);

    await ctx.db.update(t.matches).set({ status: 'closed' });
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
  });

  it('request: an approved request or an active match', async () => {
    const { sara, ahmed, photoId, ahmedToken } = await pair('request');
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    const card = await ctx.http.get(`/profiles/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(card.body).toMatchObject({ photoState: 'blurred', photoUrl: null });

    await ctx.db.insert(t.photoAccessRequests).values({ id: uuidv7(), requesterId: ahmed.id, ownerId: sara.id, status: 'approved', decidedAt: new Date() });
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(200);
    expect((await ctx.http.get(`/profiles/${sara.id}`).set(auth(ahmedToken)).expect(200)).body.photoState).toBe('visible');

    await ctx.db.delete(t.photoAccessRequests);
    await match(sara.id, ahmed.id);
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(200);
  });

  it("family: only the owner's active guardians — not even a match", async () => {
    const { sara, ahmed, photoId, ahmedToken, saraToken } = await pair('family');
    await match(sara.id, ahmed.id);
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    const matches = await ctx.http.get('/matches').set(auth(ahmedToken)).expect(200);
    const list = Array.isArray(matches.body) ? matches.body : matches.body.matches;
    expect(list[0].other).toMatchObject({ photoState: 'locked', photoUrl: null });

    const { guardianToken, guardianId } = await addGuardian(saraToken);
    await ctx.http.get(`/photos/${photoId}`).set(auth(guardianToken)).expect(200);

    // A paused guardian shares nothing new.
    await ctx.db.update(t.guardianships).set({ status: 'paused' }).where(eq(t.guardianships.id, guardianId));
    await ctx.http.get(`/photos/${photoId}`).set(auth(guardianToken)).expect(404);
  });

  it('pending photos are owner-only when PHOTO_PENDING_VISIBLE is off, until approved', async () => {
    configurePhotos({ ...photoSettings(), pendingVisible: false });
    const { sara, photoId, ahmedToken, saraToken } = await pair('public');
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    await ctx.http.get(`/photos/${photoId}`).set(auth(saraToken)).expect(200);
    const card = await ctx.http.get(`/profiles/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(card.body).toMatchObject({ photoState: 'visible', photoUrl: null }); // initials until approved

    await ctx.db.update(t.photos).set({ status: 'approved' }).where(eq(t.photos.id, photoId));
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(200);
  });

  it('moderators can load any photo for review', async () => {
    const { photoId } = await pair('family');
    const mod = await createMember(ctx, { gender: 'male' });
    await ctx.db.update(t.accounts).set({ role: 'moderator' }).where(eq(t.accounts.id, mod.id));
    const modToken = await login(ctx, mod.phone);
    await ctx.http.get(`/photos/${photoId}`).set(auth(modToken)).expect(200);
  });

  it('suspended owners and viewers lose access', async () => {
    const { sara, ahmed, photoId, ahmedToken } = await pair('public');
    await ctx.db.update(t.accounts).set({ suspendedUntil: new Date(Date.now() + 86_400_000) }).where(eq(t.accounts.id, sara.id));
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    await ctx.db.update(t.accounts).set({ suspendedUntil: null }).where(eq(t.accounts.id, sara.id));
    await ctx.db.update(t.accounts).set({ status: 'banned' }).where(eq(t.accounts.id, ahmed.id));
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
  });
});

describe('photos: access requests', () => {
  it('request → owner notified → approve → requester notified and sees the photo', async () => {
    const { sara, ahmed, photoId, ahmedToken, saraToken } = await pair('request');

    const before = await ctx.http.get(`/photos/requests/outgoing/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(before.body).toEqual({ ownerId: sara.id, status: 'none', canRequest: true, hasAccess: false });

    const sent = await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: sara.id }).expect(200);
    expect(sent.body).toMatchObject({ status: 'pending', canRequest: false, hasAccess: false });
    // One request per pair: repeating it does not notify again.
    await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: sara.id }).expect(200);
    const ownerNotes = await ctx.db.select().from(t.notifications).where(and(eq(t.notifications.accountId, sara.id), eq(t.notifications.kind, 'photo_request')));
    expect(ownerNotes).toHaveLength(1);
    expect(ownerNotes[0]!.payload).toMatchObject({ requesterId: ahmed.id });

    const incoming = await ctx.http.get('/photos/requests/incoming').set(auth(saraToken)).expect(200);
    expect(incoming.body).toHaveLength(1);
    expect(incoming.body[0]).toMatchObject({ status: 'pending', requester: { id: ahmed.id, firstName: 'Ahmed', gender: 'male', photoState: 'visible', photoUrl: null } });

    await ctx.http.put(`/photos/requests/${incoming.body[0].id}`).set(auth(saraToken)).send({ decision: 'approve' }).expect(200);
    const approvedNotes = await ctx.db.select().from(t.notifications).where(and(eq(t.notifications.accountId, ahmed.id), eq(t.notifications.kind, 'photo_approved')));
    expect(approvedNotes).toHaveLength(1);
    expect(approvedNotes[0]!.payload).toMatchObject({ ownerId: sara.id });

    const after = await ctx.http.get(`/photos/requests/outgoing/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(after.body).toMatchObject({ status: 'approved', hasAccess: true, canRequest: false });
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(200);
    const card = await ctx.http.get(`/profiles/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(card.body.photoState).toBe('visible');
    expect((await ctx.http.get('/photos/requests/incoming').set(auth(saraToken)).expect(200)).body[0].status).toBe('approved');
  });

  it('decline is silent (stays "pending" for the requester) and revokes an earlier approval', async () => {
    const { sara, ahmed, photoId, ahmedToken, saraToken } = await pair('request');
    await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: sara.id }).expect(200);
    const [req] = await ctx.db.select().from(t.photoAccessRequests);
    await ctx.http.put(`/photos/requests/${req!.id}`).set(auth(saraToken)).send({ decision: 'approve' }).expect(200);
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(200);

    const res = await ctx.http.put(`/photos/requests/${req!.id}`).set(auth(saraToken)).send({ decision: 'decline' }).expect(200);
    expect(res.body).toEqual({ ok: true, status: 'declined' });
    await ctx.http.get(`/photos/${photoId}`).set(auth(ahmedToken)).expect(404);
    const view = await ctx.http.get(`/photos/requests/outgoing/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(view.body).toMatchObject({ status: 'pending', hasAccess: false });
    // Declined requests are not re-sent and leave the owner's list.
    await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: sara.id }).expect(200);
    expect(await ctx.db.select().from(t.photoAccessRequests)).toHaveLength(1);
    expect((await ctx.http.get('/photos/requests/incoming').set(auth(saraToken)).expect(200)).body).toEqual([]);
    const declineNotes = await ctx.db.select().from(t.notifications).where(eq(t.notifications.accountId, ahmed.id));
    expect(declineNotes.filter((n) => n.kind !== 'photo_approved')).toHaveLength(0);
  });

  it('validates the target: self, unknown, same gender, not requestable, no photo, already visible', async () => {
    const { sara, ahmed, ahmedToken, saraToken } = await pair('matches');
    expect((await ctx.http.post('/photos/requests').set(auth(saraToken)).send({ ownerId: sara.id }).expect(400)).body.error).toBe('cannot_request_self');
    await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: 'nope' }).expect(400);
    await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: uuidv7() }).expect(404);
    const layla = await createMember(ctx, { gender: 'female' });
    const laylaToken = await login(ctx, layla.phone);
    await ctx.http.post('/photos/requests').set(auth(laylaToken)).send({ ownerId: sara.id }).expect(404);

    // "Matches only" cannot be unlocked by a request.
    expect((await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: sara.id }).expect(409)).body.error).toBe('not_requestable');
    const view = await ctx.http.get(`/photos/requests/outgoing/${sara.id}`).set(auth(ahmedToken)).expect(200);
    expect(view.body).toMatchObject({ canRequest: false, hasAccess: false, status: 'none' });

    // No photo at all.
    const mona = await createMember(ctx, { gender: 'female', photoVisibility: 'request' });
    await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: mona.id }).expect(409);

    // Already visible (matched): nothing is created.
    await match(sara.id, ahmed.id);
    const ok = await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: sara.id }).expect(200);
    expect(ok.body).toMatchObject({ hasAccess: true });
    expect(await ctx.db.select().from(t.photoAccessRequests)).toHaveLength(0);

    // Blocked: looks like it does not exist.
    const nour = await createMember(ctx, { gender: 'female', photoVisibility: 'request' });
    await ctx.db.insert(t.blocks).values({ blockerId: nour.id, blockedId: ahmed.id });
    await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: nour.id }).expect(404);
    await ctx.http.get(`/photos/requests/outgoing/${nour.id}`).set(auth(ahmedToken)).expect(404);
  });

  it(`rate-limits new requests to ${PHOTO_LIMITS.requestsPerDay} a day`, async () => {
    const { sara, ahmed, ahmedToken } = await pair('request');
    for (let i = 0; i < PHOTO_LIMITS.requestsPerDay; i++) {
      const other = await createMember(ctx, { gender: 'female' });
      await ctx.db.insert(t.photoAccessRequests).values({ id: uuidv7(), requesterId: ahmed.id, ownerId: other.id });
    }
    const res = await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: sara.id }).expect(429);
    expect(res.body.error).toBe('rate_limited');
  });

  it("only the owner decides; bad decisions are rejected", async () => {
    const { sara, ahmed, ahmedToken, saraToken } = await pair('request');
    await ctx.http.post('/photos/requests').set(auth(ahmedToken)).send({ ownerId: sara.id }).expect(200);
    const [req] = await ctx.db.select().from(t.photoAccessRequests);
    await ctx.http.put(`/photos/requests/${req!.id}`).set(auth(ahmedToken)).send({ decision: 'approve' }).expect(404);
    await ctx.http.put(`/photos/requests/${req!.id}`).set(auth(saraToken)).send({ decision: 'maybe' }).expect(400);
    await ctx.http.put(`/photos/requests/${uuidv7()}`).set(auth(saraToken)).send({ decision: 'approve' }).expect(404);
    expect((await ctx.http.get('/photos/requests/incoming').set(auth(ahmedToken)).expect(200)).body).toEqual([]);
    void ahmed;
  });
});
