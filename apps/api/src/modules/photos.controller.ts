import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { z } from 'zod';
import { PHOTO_LIMITS, type IncomingPhotoRequest, type Photo, type PhotoAccessView } from '@halal-meet/core';
import { Public, UserId, ZodPipe, type AuthedRequest } from '../common/http';
import { AuthService } from './auth.service';
import { verifyPhotoToken } from './photo-access';
import { PhotosService, type UploadedPhotoFile } from './photos.service';

const uuid = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'expected a uuid');
const orderSchema = z.object({ ids: z.array(uuid).max(PHOTO_LIMITS.maxPhotos) });
const requestSchema = z.object({ ownerId: uuid });
const decisionSchema = z.object({ decision: z.enum(['approve', 'decline']) });

interface RawResponse {
  status(code: number): RawResponse;
  setHeader(name: string, value: string): void;
  end(body?: Buffer): void;
}

/** Routes from `PHOTO_ROUTES` in @halal-meet/core. */
@Controller()
export class PhotosController {
  constructor(
    @Inject(PhotosService) private readonly photos: PhotosService,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  // ───────── Own photos ─────────
  @Get('me/photos')
  list(@UserId() id: string): Promise<Photo[]> {
    return this.photos.list(id);
  }

  @Post('me/photos')
  @HttpCode(201)
  // Multer rejects bigger files with 413 before they are buffered completely.
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: PHOTO_LIMITS.maxBytes, files: 1 } }))
  upload(@UserId() id: string, @UploadedFile() file: UploadedPhotoFile | undefined, @Body() body: { position?: string } | undefined): Promise<Photo> {
    return this.photos.upload(id, file, body?.position);
  }

  @Put('me/photos/order')
  reorder(@UserId() id: string, @Body(new ZodPipe(orderSchema)) body: { ids: string[] }): Promise<Photo[]> {
    return this.photos.reorder(id, body.ids);
  }

  @Delete('me/photos/:id')
  async remove(@UserId() id: string, @Param('id') photoId: string): Promise<{ ok: true }> {
    await this.photos.remove(id, photoId);
    return { ok: true };
  }

  // ───────── Access requests ─────────
  @Post('photos/requests')
  @HttpCode(200)
  request(@UserId() id: string, @Body(new ZodPipe(requestSchema)) body: { ownerId: string }): Promise<PhotoAccessView> {
    return this.photos.request(id, body.ownerId);
  }

  @Get('photos/requests/incoming')
  incoming(@UserId() id: string): Promise<IncomingPhotoRequest[]> {
    return this.photos.incoming(id);
  }

  @Get('photos/requests/outgoing/:ownerId')
  access(@UserId() id: string, @Param('ownerId') ownerId: string): Promise<PhotoAccessView> {
    return this.photos.accessView(id, ownerId);
  }

  @Put('photos/requests/:id')
  decide(
    @UserId() id: string,
    @Param('id') requestId: string,
    @Body(new ZodPipe(decisionSchema)) body: { decision: 'approve' | 'decline' },
  ): Promise<{ ok: true; status: 'approved' | 'declined' }> {
    return this.photos.decide(id, requestId, body.decision);
  }

  // ───────── Bytes ─────────
  /**
   * Accepts a bearer token or the signed `t` from a photo URL (so `<Image>` works without headers).
   * Every "no" is a 404, whether the photo is missing, private, pending or rejected.
   */
  @Public()
  @Get('photos/:id')
  async bytes(@Param('id') photoId: string, @Query('t') token: string | undefined, @Req() req: AuthedRequest, @Res() res: RawResponse): Promise<void> {
    const header = req.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    const bearer = raw?.startsWith('Bearer ') ? this.auth.verify(raw.slice(7).trim()) : null;
    const viewerId = bearer ?? verifyPhotoToken(token, photoId);
    if (!viewerId) throw new UnauthorizedException({ error: 'unauthorized' });
    const found = await this.photos.serve(viewerId, photoId);
    if (!found) throw new NotFoundException({ error: 'not_found' });
    res.setHeader('Content-Type', found.mime);
    res.setHeader('Cache-Control', 'private, max-age=300');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.status(200).end(found.bytes);
  }
}
