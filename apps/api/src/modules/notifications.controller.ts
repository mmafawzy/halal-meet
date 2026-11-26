import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Query, Req, Res, UnauthorizedException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import {
  NOTIFICATION_CATEGORIES,
  type MarkReadBody,
  TOP_PICKS_TIME_RE,
  type NotificationPrefs,
  type NotificationPrefsInput,
  type NotificationsPage,
  type PushPlatform,
  type RealtimeEvent,
  type UnreadCountResponse,
} from '@halal-meet/core';
import { Public, UserId, ZodPipe } from '../common/http';
import { AuthService } from './auth.service';
import { NotificationsService } from './notifications.service';
import { RealtimeHub } from './realtime';

const deviceSchema = z.object({
  platform: z.enum(['ios', 'android', 'web']),
  pushToken: z.string().min(8).max(512),
});

const prefsSchema = z.object({
  categories: z.object(Object.fromEntries(NOTIFICATION_CATEGORIES.map((c) => [c, z.boolean().optional()]))).strict().optional(),
  topPicksTime: z.string().regex(TOP_PICKS_TIME_RE, 'maghrib | morning | evening | HH:MM').optional(),
  quietHours: z.boolean().optional(),
});

const listSchema = z.object({
  before: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

const readSchema = z
  .object({ ids: z.array(z.string().uuid()).max(200).optional(), all: z.boolean().optional(), matchId: z.string().uuid().optional() })
  .refine((b) => b.all === true || (b.ids?.length ?? 0) > 0 || !!b.matchId, 'ids, matchId or all is required');

/** Heartbeat comment so proxies keep the stream open. */
const HEARTBEAT_MS = 25_000;

@Controller()
export class NotificationsController {
  constructor(
    @Inject(NotificationsService) private readonly notifications: NotificationsService,
    @Inject(RealtimeHub) private readonly realtime: RealtimeHub,
    @Inject(AuthService) private readonly auth: AuthService,
  ) {}

  // ───────── Devices ─────────

  @Post('me/devices')
  @HttpCode(200)
  async registerDevice(@UserId() id: string, @Body(new ZodPipe(deviceSchema)) body: { platform: PushPlatform; pushToken: string }): Promise<{ ok: true }> {
    await this.notifications.registerDevice(id, body.platform, body.pushToken);
    return { ok: true };
  }

  @Delete('me/devices/:token')
  @HttpCode(200)
  async removeDevice(@UserId() id: string, @Param('token') token: string): Promise<{ ok: true }> {
    await this.notifications.removeDevice(id, token);
    return { ok: true };
  }

  // ───────── Preferences ─────────

  @Get('me/notification-prefs')
  getPrefs(@UserId() id: string): Promise<NotificationPrefs> {
    return this.notifications.getPrefs(id);
  }

  @Put('me/notification-prefs')
  putPrefs(@UserId() id: string, @Body(new ZodPipe(prefsSchema)) body: NotificationPrefsInput): Promise<NotificationPrefs> {
    return this.notifications.putPrefs(id, body);
  }

  // ───────── Inbox ─────────

  @Get('notifications')
  list(@UserId() id: string, @Query(new ZodPipe(listSchema)) q: { before?: string; limit?: number }): Promise<NotificationsPage> {
    return this.notifications.list(id, q.before, q.limit);
  }

  @Get('notifications/unread-count')
  async unread(@UserId() id: string): Promise<UnreadCountResponse> {
    return { unread: await this.notifications.unreadCount(id) };
  }

  @Post('notifications/read')
  @HttpCode(200)
  async read(@UserId() id: string, @Body(new ZodPipe(readSchema)) body: MarkReadBody): Promise<UnreadCountResponse> {
    if (body.matchId) await this.notifications.markThreadRead(id, body.matchId);
    return { unread: await this.notifications.markRead(id, body) };
  }

  // ───────── Realtime (Server-Sent Events) ─────────

  /**
   * `GET /events` streams `message`, `match` and `notification` events for the signed-in account. Browsers'
   * EventSource cannot set headers, so `?token=` is accepted as well as `Authorization: Bearer`.
   */
  @Public()
  @Get('events')
  events(@Req() req: Request, @Res() res: Response, @Query('token') queryToken?: string): void {
    const header = req.headers.authorization;
    const bearer = header?.startsWith('Bearer ') ? header.slice(7).trim() : null;
    const token = bearer || (typeof queryToken === 'string' ? queryToken : null);
    const accountId = token ? this.auth.verify(token) : null;
    if (!accountId) throw new UnauthorizedException({ error: 'unauthorized' });

    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const write = (event: RealtimeEvent) => {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
    };
    res.write('retry: 3000\n\n');
    write({ type: 'ready', data: {} });

    const unsubscribe = this.realtime.subscribe(accountId, write);
    const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);
    heartbeat.unref?.();
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }
}
