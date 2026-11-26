import { Body, Controller, createParamDecorator, type ExecutionContext, Get, HttpCode, Inject, Param, Post, Query, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import {
  MAX_SUSPEND_DAYS,
  RESOLVE_ACTIONS,
  type AdminAccountDetail,
  type AdminAuditPage,
  type AdminPhotoItem,
  type AdminReportDetail,
  type AdminReportListItem,
  type AdminStats,
} from '@halal-meet/core';
import { UserId, ZodPipe } from '../common/http';
import { AdminGuard } from './admin.guard';
import { ModerationService } from './moderation.service';

const reportCategory = z.enum(['scam', 'harassment', 'fake_profile', 'inappropriate', 'underage', 'other']);
const reason = z.string().trim().min(3).max(1000);

export const resolveReportSchema = z.object({
  action: z.enum(RESOLVE_ACTIONS as unknown as [string, ...string[]]),
  reason,
  days: z.number().int().min(1).max(MAX_SUSPEND_DAYS).optional(),
  messageId: z.string().uuid().optional(),
});
export const reinstateSchema = z.object({ reason });
export const photoDecisionSchema = z.object({ decision: z.enum(['approve', 'reject']), reason: z.string().trim().max(1000).optional() });
const reportsQuerySchema = z.object({ status: z.enum(['open', 'actioned', 'dismissed']).optional(), category: reportCategory.optional() });
const photosQuerySchema = z.object({ status: z.enum(['pending', 'approved', 'rejected']).optional() });
const auditQuerySchema = z.object({
  moderatorId: z.string().uuid().optional(),
  subjectId: z.string().uuid().optional(),
  action: z.enum(['dismiss', 'warn', 'hide_message', 'suspend', 'ban', 'reinstate', 'approve_photo', 'reject_photo']).optional(),
  before: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** The caller's staff role, set by AdminGuard. */
const StaffRole = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  return ctx.switchToHttp().getRequest<{ staffRole?: string }>().staffRole ?? 'moderator';
});

/** Routes from `MODERATION_ROUTES` in @halal-meet/core. Staff only (moderator, admin). */
@Controller('admin')
@UseGuards(AdminGuard)
export class ModerationController {
  constructor(@Inject(ModerationService) private readonly moderation: ModerationService) {}

  @Get('reports')
  reports(@Query(new ZodPipe(reportsQuerySchema)) q: z.infer<typeof reportsQuerySchema>): Promise<AdminReportListItem[]> {
    return this.moderation.listReports(q.status ?? 'open', q.category);
  }

  @Get('reports/:id')
  report(@Param('id', new ZodPipe(z.string().uuid())) id: string): Promise<AdminReportDetail> {
    return this.moderation.getReport(id);
  }

  @Post('reports/:id/resolve')
  @HttpCode(200)
  resolve(
    @UserId() moderatorId: string,
    @StaffRole() role: string,
    @Param('id', new ZodPipe(z.string().uuid())) id: string,
    @Body(new ZodPipe(resolveReportSchema)) body: z.infer<typeof resolveReportSchema>,
  ): Promise<AdminReportDetail> {
    return this.moderation.resolve(moderatorId, role, id, body as Parameters<ModerationService['resolve']>[3]);
  }

  @Get('accounts/:id')
  account(@UserId() viewerId: string, @Param('id', new ZodPipe(z.string().uuid())) id: string): Promise<AdminAccountDetail> {
    return this.moderation.account(viewerId, id);
  }

  @Post('accounts/:id/reinstate')
  @HttpCode(200)
  reinstate(
    @UserId() moderatorId: string,
    @StaffRole() role: string,
    @Param('id', new ZodPipe(z.string().uuid())) id: string,
    @Body(new ZodPipe(reinstateSchema)) body: z.infer<typeof reinstateSchema>,
  ): Promise<AdminAccountDetail> {
    return this.moderation.reinstate(moderatorId, role, id, body.reason);
  }

  @Get('photos')
  photos(@UserId() viewerId: string, @Query(new ZodPipe(photosQuerySchema)) q: z.infer<typeof photosQuerySchema>): Promise<AdminPhotoItem[]> {
    return this.moderation.listPhotos(viewerId, q.status ?? 'pending');
  }

  @Post('photos/:id')
  @HttpCode(200)
  decidePhoto(
    @UserId() moderatorId: string,
    @Param('id', new ZodPipe(z.string().uuid())) id: string,
    @Body(new ZodPipe(photoDecisionSchema)) body: z.infer<typeof photoDecisionSchema>,
  ): Promise<AdminPhotoItem> {
    return this.moderation.decidePhoto(moderatorId, id, body);
  }

  @Get('audit')
  audit(@Query(new ZodPipe(auditQuerySchema)) q: z.infer<typeof auditQuerySchema>): Promise<AdminAuditPage> {
    return this.moderation.audit(q);
  }

  @Get('stats')
  stats(): Promise<AdminStats> {
    return this.moderation.stats();
  }
}
