import { Body, Controller, Get, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import type { BillingSyncResponse, MeBillingResponse, RevenueCatWebhookResponse } from '@halal-meet/core';
import { Public, UserId } from '../common/http';
import { BillingService } from './billing.service';

/** Routes of core `BILLING_ROUTES`. The dev grant stays in AccountController (`POST /billing/dev/grant`). */
@Controller()
export class BillingController {
  constructor(@Inject(BillingService) private readonly billing: BillingService) {}

  /** RevenueCat → server. Authenticated by the shared secret in `Authorization`, not by a user token. */
  @Public()
  @Post('billing/revenuecat/webhook')
  @HttpCode(200)
  async revenuecatWebhook(@Headers('authorization') authorization: string | undefined, @Body() body: unknown): Promise<RevenueCatWebhookResponse> {
    this.billing.verifyWebhookAuth(authorization);
    return this.billing.handleRevenueCatWebhook(body);
  }

  @Get('me/billing')
  myBilling(@UserId() id: string): Promise<MeBillingResponse> {
    return this.billing.myBilling(id);
  }

  @Post('billing/sync')
  @HttpCode(200)
  sync(@UserId() id: string): Promise<BillingSyncResponse> {
    return this.billing.sync(id);
  }

  @Post('billing/free-pass')
  @HttpCode(200)
  claimFreePass(@UserId() id: string): Promise<BillingSyncResponse> {
    return this.billing.claimFreePass(id);
  }
}
