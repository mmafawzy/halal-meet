import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { isStaffRole } from '@halal-meet/core';
import type { AuthedRequest } from '../common/http';
import { DB, type Db } from '../db/client';
import * as t from '../db/schema';

/**
 * Staff-only routes (moderation console). Runs after the global AuthGuard, so `req.accountId` is set;
 * the role is read from the database on every request so a demotion takes effect immediately.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(@Inject(DB) private readonly db: Db) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<AuthedRequest & { staffRole?: string }>();
    if (!req.accountId) throw new ForbiddenException({ error: 'forbidden' });
    const [row] = await this.db.select({ role: t.accounts.role, status: t.accounts.status }).from(t.accounts).where(eq(t.accounts.id, req.accountId));
    if (!row || !isStaffRole(row.role) || row.status === 'banned' || row.status === 'suspended' || row.status === 'deleted') {
      throw new ForbiddenException({ error: 'forbidden' });
    }
    req.staffRole = row.role;
    return true;
  }
}
