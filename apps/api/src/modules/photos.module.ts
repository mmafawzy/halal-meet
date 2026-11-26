import { type CallHandler, type ExecutionContext, Inject, Injectable, Module, type NestInterceptor } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { mergeMap, type Observable } from 'rxjs';
import { PhotosController } from './photos.controller';
import { PhotosService } from './photos.service';
import { createPhotoStorage, PHOTO_STORAGE } from './storage';

interface HttpRequestLike {
  accountId?: string;
  protocol?: string;
  get?(name: string): string | undefined;
  headers: Record<string, string | string[] | undefined>;
}

function originOf(req: HttpRequestLike): string {
  const host = req.get?.('host') ?? (req.headers.host as string | undefined) ?? 'localhost';
  const fwd = req.headers['x-forwarded-proto'];
  const proto = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim() || req.protocol || 'http';
  return `${proto}://${host}`;
}

/**
 * Applies photo privacy to every authenticated JSON response: ProfileCard-shaped objects get the
 * viewer's photoState and a viewer-bound photoUrl (or null), and `/photos/…` paths become absolute.
 */
@Injectable()
export class PhotoCardsInterceptor implements NestInterceptor {
  constructor(@Inject(PhotosService) private readonly photos: PhotosService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (ctx.getType() !== 'http') return next.handle();
    const req = ctx.switchToHttp().getRequest<HttpRequestLike>();
    return next.handle().pipe(
      mergeMap(async (body: unknown) => {
        if (req.accountId && body && typeof body === 'object' && !Buffer.isBuffer(body)) {
          await this.photos.decorate(body, req.accountId, originOf(req));
        }
        return body;
      }),
    );
  }
}

/**
 * Photos & photo privacy. Relies on the global AppModule exports (CONFIG, DB, AuthService, MembersService,
 * NotificationsService).
 */
@Module({
  controllers: [PhotosController],
  providers: [
    { provide: PHOTO_STORAGE, useFactory: () => createPhotoStorage() },
    PhotosService,
    { provide: APP_INTERCEPTOR, useClass: PhotoCardsInterceptor },
  ],
  exports: [PhotosService, PHOTO_STORAGE],
})
export class PhotosModule {}
