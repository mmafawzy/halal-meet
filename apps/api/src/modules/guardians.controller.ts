import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Patch, Post, Put } from '@nestjs/common';
import type {
  Guardian,
  GuardianApprovalBody,
  GuardianShareBody,
  GuardianDashboard,
  GuardianInviteBody,
  GuardianInvitePreview,
  GuardianInviteResponse,
  GuardianLink,
  GuardianOpinion,
  GuardianOpinionBody,
  GuardianUpdateBody,
} from '@halal-meet/core';
import { Public, UserId, ZodPipe } from '../common/http';
import { guardianApprovalSchema, guardianInviteSchema, guardianOpinionSchema, guardianShareSchema, guardianUpdateSchema } from './dtos';
import { GuardiansService } from './guardians.service';

/** Routes from `GUARDIAN_ROUTES` in @halal-meet/core. */
@Controller()
export class GuardiansController {
  constructor(@Inject(GuardiansService) private readonly guardians: GuardiansService) {}

  // ───────── Member side ─────────
  @Get('guardians')
  list(@UserId() id: string): Promise<Guardian[]> {
    return this.guardians.list(id);
  }

  @Get('guardians/opinions')
  opinions(@UserId() id: string): Promise<GuardianOpinion[]> {
    return this.guardians.opinionsForMember(id);
  }

  @Post('guardians/shares')
  @HttpCode(200)
  async share(@UserId() id: string, @Body(new ZodPipe(guardianShareSchema)) body: GuardianShareBody): Promise<{ ok: true }> {
    await this.guardians.share(id, body.subjectId);
    return { ok: true };
  }

  @Delete('guardians/shares/:subjectId')
  async unshare(@UserId() id: string, @Param('subjectId') subjectId: string): Promise<{ ok: true }> {
    await this.guardians.unshare(id, subjectId);
    return { ok: true };
  }

  @Post('guardians')
  @HttpCode(201)
  invite(@UserId() id: string, @Body(new ZodPipe(guardianInviteSchema)) body: GuardianInviteBody): Promise<GuardianInviteResponse> {
    return this.guardians.invite(id, body);
  }

  @Patch('guardians/:id')
  update(@UserId() id: string, @Param('id') guardianId: string, @Body(new ZodPipe(guardianUpdateSchema)) body: GuardianUpdateBody): Promise<Guardian> {
    return this.guardians.update(id, guardianId, body);
  }

  @Post('guardians/:id/invite')
  @HttpCode(200)
  reissue(@UserId() id: string, @Param('id') guardianId: string): Promise<GuardianInviteResponse> {
    return this.guardians.reissue(id, guardianId);
  }

  @Delete('guardians/:id')
  async remove(@UserId() id: string, @Param('id') guardianId: string): Promise<{ ok: true }> {
    await this.guardians.remove(id, guardianId);
    return { ok: true };
  }

  // ───────── Invitations ─────────
  @Public()
  @Get('guardian-invites/:code')
  preview(@Param('code') code: string): Promise<GuardianInvitePreview> {
    return this.guardians.preview(code);
  }

  @Post('guardian-invites/:code/accept')
  @HttpCode(200)
  accept(@UserId() id: string, @Param('code') code: string): Promise<GuardianLink> {
    return this.guardians.accept(id, code);
  }

  // ───────── Guardian side ─────────
  @Get('guardian/members')
  links(@UserId() id: string): Promise<GuardianLink[]> {
    return this.guardians.links(id);
  }

  @Get('guardian/members/:memberId')
  dashboard(@UserId() id: string, @Param('memberId') memberId: string): Promise<GuardianDashboard> {
    return this.guardians.dashboard(id, memberId);
  }

  @Put('guardian/members/:memberId/opinions/:subjectId')
  async opinion(
    @UserId() id: string,
    @Param('memberId') memberId: string,
    @Param('subjectId') subjectId: string,
    @Body(new ZodPipe(guardianOpinionSchema)) body: GuardianOpinionBody,
  ): Promise<{ ok: true }> {
    await this.guardians.putOpinion(id, memberId, subjectId, body);
    return { ok: true };
  }

  @Put('guardian/members/:memberId/approvals/:matchId')
  async approval(
    @UserId() id: string,
    @Param('memberId') memberId: string,
    @Param('matchId') matchId: string,
    @Body(new ZodPipe(guardianApprovalSchema)) body: GuardianApprovalBody,
  ): Promise<{ ok: true }> {
    await this.guardians.decideStage(id, memberId, matchId, body);
    return { ok: true };
  }

  @Delete('guardian/members/:memberId')
  async leave(@UserId() id: string, @Param('memberId') memberId: string): Promise<{ ok: true }> {
    await this.guardians.leave(id, memberId);
    return { ok: true };
  }
}
