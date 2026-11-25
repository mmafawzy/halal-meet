import { Body, Controller, Delete, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import type {
  FeedPage,
  IncomingInterestsResponse,
  InterestResponse,
  MatchSummary,
  Message,
  PassportResponse,
  ProfileCard,
  TopPicksResponse,
  PassBody,
} from '@halal-meet/core';
import { UserId, ZodPipe } from '../common/http';
import { FeedService } from './feed.service';
import { InteractionsService } from './interactions.service';
import {
  answerTopicSchema,
  closeMatchSchema,
  feedQuerySchema,
  interestSchema,
  messagesQuerySchema,
  passSchema,
  passportDestinationSchema,
  sendMessageSchema,
  stageReadySchema,
} from './dtos';
import type { JourneyStage } from '@halal-meet/core';

@Controller()
export class DiscoverController {
  constructor(
    @Inject(FeedService) private readonly feed: FeedService,
    @Inject(InteractionsService) private readonly interactions: InteractionsService,
  ) {}

  @Get('feed')
  async getFeed(@UserId() id: string, @Query(new ZodPipe(feedQuerySchema)) query: { cursor?: string }): Promise<FeedPage> {
    return this.feed.page(id, query.cursor);
  }

  @Get('top-picks')
  topPicks(@UserId() id: string): Promise<TopPicksResponse> {
    return this.feed.topPicks(id);
  }

  @Get('profiles/:id')
  profile(@UserId() id: string, @Param('id') targetId: string): Promise<ProfileCard> {
    return this.interactions.profileCard(id, targetId);
  }

  @Post('interests')
  @HttpCode(200)
  interest(@UserId() id: string, @Body(new ZodPipe(interestSchema)) body: { toId: string; level: 'interest' | 'serious'; note?: string; abym?: Record<string, 'compatible' | 'not_compatible' | 'discuss'> }): Promise<InterestResponse> {
    return this.interactions.sendInterest(id, body);
  }

  @Post('passes')
  @HttpCode(200)
  async pass(@UserId() id: string, @Body(new ZodPipe(passSchema)) body: PassBody): Promise<{ ok: true }> {
    await this.interactions.pass(id, body);
    return { ok: true };
  }

  @Get('interests/incoming')
  incoming(@UserId() id: string): Promise<IncomingInterestsResponse> {
    return this.interactions.incoming(id);
  }

  @Get('matches')
  async matches(@UserId() id: string): Promise<MatchSummary[]> {
    return this.interactions.listMatches(id);
  }

  @Get('matches/:matchId/messages')
  messages(@UserId() id: string, @Param('matchId') matchId: string, @Query(new ZodPipe(messagesQuerySchema)) query: { before?: string }): Promise<Message[]> {
    return this.interactions.messages(id, matchId, query.before);
  }

  @Post('matches/:matchId/messages')
  @HttpCode(200)
  sendMessage(
    @UserId() id: string,
    @Param('matchId') matchId: string,
    @Body(new ZodPipe(sendMessageSchema)) body: { kind: 'text' | 'topic_card'; body?: string; topicKey?: string },
  ): Promise<Message> {
    return this.interactions.sendMessage(id, matchId, body);
  }

  @Post('matches/:matchId/messages/:messageId/answer')
  @HttpCode(200)
  answerTopic(
    @UserId() id: string,
    @Param('matchId') matchId: string,
    @Param('messageId') messageId: string,
    @Body(new ZodPipe(answerTopicSchema)) body: { value: string },
  ): Promise<Message> {
    return this.interactions.answerTopic(id, matchId, messageId, body.value);
  }

  @Post('matches/:matchId/stage-ready')
  @HttpCode(200)
  async stageReady(@UserId() id: string, @Param('matchId') matchId: string, @Body(new ZodPipe(stageReadySchema)) body: { stage: JourneyStage }): Promise<{ ok: true }> {
    await this.interactions.stageReady(id, matchId, body.stage);
    return { ok: true };
  }

  @Post('matches/:matchId/close')
  @HttpCode(200)
  async close(@UserId() id: string, @Param('matchId') matchId: string, @Body(new ZodPipe(closeMatchSchema)) body: { template: 'respectful_default' | 'custom'; message?: string; reason?: string }): Promise<{ ok: true }> {
    await this.interactions.closeMatch(id, matchId, body);
    return { ok: true };
  }

  @Get('passport')
  passport(@UserId() id: string): Promise<PassportResponse> {
    return this.interactions.passport(id) as Promise<PassportResponse>;
  }

  @Post('passport/destinations')
  @HttpCode(200)
  addDestination(
    @UserId() id: string,
    @Body(new ZodPipe(passportDestinationSchema)) body: { country: string; city?: string | null; isWorldwide?: boolean; purpose: string; visitFrom?: string | null; visitTo?: string | null },
  ): Promise<{ ok: true; id: string }> {
    return this.interactions.addPassportDestination(id, body);
  }

  @Delete('passport/destinations/:id')
  async removeDestination(@UserId() id: string, @Param('id') destinationId: string): Promise<{ ok: true }> {
    await this.interactions.removePassportDestination(id, destinationId);
    return { ok: true };
  }
}
