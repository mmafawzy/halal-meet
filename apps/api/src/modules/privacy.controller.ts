import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Put, Res } from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import type {
  BlockedMember,
  Consent,
  ConsentBody,
  DataExport,
  GuardianShareSummary,
  IncognitoBody,
  MyPreferencesResponse,
  PauseBody,
  PrivacyStatus,
} from '@halal-meet/core';
import { UserId, ZodPipe } from '../common/http';
import { UUID_RE } from '../common/ids';
import { PrivacyService } from './privacy.service';

const pauseSchema = z.object({ until: z.string().min(10).max(40).nullable() });
const incognitoSchema = z.object({ on: z.boolean() });
const consentSchema = z.object({ granted: z.boolean(), version: z.string().min(1).max(20).optional() });

/** Routes from `PRIVACY_ROUTES` in @halal-meet/core. */
@Controller()
export class PrivacyController {
  constructor(@Inject(PrivacyService) private readonly privacy: PrivacyService) {}

  @Get('me/privacy')
  status(@UserId() id: string): Promise<PrivacyStatus> {
    return this.privacy.status(id);
  }

  @Put('me/pause')
  @HttpCode(200)
  pause(@UserId() id: string, @Body(new ZodPipe(pauseSchema)) body: PauseBody): Promise<PrivacyStatus> {
    return this.privacy.pause(id, body.until);
  }

  @Delete('me/pause')
  resume(@UserId() id: string): Promise<PrivacyStatus> {
    return this.privacy.resume(id);
  }

  @Put('me/incognito')
  @HttpCode(200)
  incognito(@UserId() id: string, @Body(new ZodPipe(incognitoSchema)) body: IncognitoBody): Promise<PrivacyStatus> {
    return this.privacy.setIncognito(id, body.on);
  }

  @Get('me/export')
  async export(@UserId() id: string, @Res({ passthrough: true }) res: Response): Promise<DataExport> {
    const data = await this.privacy.export(id);
    const day = data.exportedAt.slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="halal-meet-export-${day}.json"`);
    res.setHeader('Cache-Control', 'no-store');
    return data;
  }

  @Post('me/deletion')
  @HttpCode(200)
  requestDeletion(@UserId() id: string): Promise<PrivacyStatus> {
    return this.privacy.requestDeletion(id);
  }

  @Delete('me/deletion')
  cancelDeletion(@UserId() id: string): Promise<PrivacyStatus> {
    return this.privacy.cancelDeletion(id);
  }

  @Get('me/consents')
  consents(@UserId() id: string): Promise<Consent[]> {
    return this.privacy.consents(id);
  }

  @Put('me/consents/:kind')
  @HttpCode(200)
  putConsent(@UserId() id: string, @Param('kind') kind: string, @Body(new ZodPipe(consentSchema)) body: ConsentBody): Promise<Consent[]> {
    return this.privacy.putConsent(id, kind, body.granted, body.version);
  }

  @Get('me/preferences')
  preferences(@UserId() id: string): Promise<MyPreferencesResponse> {
    return this.privacy.preferences(id);
  }

  @Get('blocks')
  blocks(@UserId() id: string): Promise<BlockedMember[]> {
    return this.privacy.blocks(id);
  }

  @Delete('blocks/:subjectId')
  async unblock(@UserId() id: string, @Param('subjectId') subjectId: string): Promise<{ ok: true }> {
    if (UUID_RE.test(subjectId)) await this.privacy.unblock(id, subjectId);
    return { ok: true };
  }

  @Get('guardians/shares')
  guardianShares(@UserId() id: string): Promise<GuardianShareSummary[]> {
    return this.privacy.guardianShares(id);
  }
}
