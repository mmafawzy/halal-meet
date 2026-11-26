import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { eq } from 'drizzle-orm';
import { RESTRICTED_ACCOUNT_ALLOWED } from '@halal-meet/core';
import { IS_PUBLIC, type AuthedRequest } from '../common/http';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';
import { AuthService } from './auth.service';
import { deletionGraceDays } from './privacy.service';

/** "GET /me/privacy" for the current request (query string and trailing slash dropped). */
function routeKey(req: { method?: string; path?: string; url?: string }): string {
  const raw = req.path ?? (req.url ?? '').split('?')[0] ?? '';
  const path = raw.length > 1 ? raw.replace(/\/+$/, '') : raw;
  return `${(req.method ?? 'GET').toUpperCase()} ${path}`;
}

const ALLOWED = new Set(RESTRICTED_ACCOUNT_ALLOWED);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(DB) private readonly db: Db,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()]);
    if (isPublic) return true;
    const req = ctx.switchToHttp().getRequest<AuthedRequest & { method?: string; path?: string; url?: string }>();
    const header = req.headers.authorization;
    const raw = Array.isArray(header) ? header[0] : header;
    const token = raw?.startsWith('Bearer ') ? raw.slice(7).trim() : null;
    if (!token) throw new UnauthorizedException({ error: 'unauthorized' });
    const accountId = this.auth.verify(token);
    if (!accountId) throw new UnauthorizedException({ error: 'invalid_token' });

    // Account state (spec 05): erased accounts are signed out; suspended, banned and deletion-pending accounts
    // may only read their own state, export their data and manage the deletion request.
    const [account] = await this.db
      .select({ status: t.accounts.status, suspendedUntil: t.accounts.suspendedUntil, deletionRequestedAt: t.accounts.deletionRequestedAt })
      .from(t.accounts)
      .where(eq(t.accounts.id, accountId));
    if (!account || account.status === 'deleted') throw new UnauthorizedException({ error: 'invalid_token' });
    req.accountId = accountId;

    const now = Date.now();
    const banned = account.status === 'banned';
    const suspendedUntil = account.suspendedUntil;
    const suspended =
      (account.status === 'suspended' && (!suspendedUntil || suspendedUntil.getTime() > now)) || (!!suspendedUntil && suspendedUntil.getTime() > now);
    const deletionPending = !!account.deletionRequestedAt;
    if (!banned && !suspended && !deletionPending) return true;
    if (ALLOWED.has(routeKey(req))) return true;
    if (banned) throw new ForbiddenException({ error: 'account_banned' });
    if (suspended) throw new ForbiddenException({ error: 'account_suspended', until: suspendedUntil ? suspendedUntil.toISOString() : null });
    const scheduledFor = new Date(account.deletionRequestedAt!.getTime() + deletionGraceDays() * 86_400_000);
    throw new ForbiddenException({ error: 'deletion_pending', scheduledFor: scheduledFor.toISOString() });
  }
}
