import { Global, Module } from '@nestjs/common';
import { loadConfig } from './config';
import { CONFIG } from './config';
import { DatabaseModule } from './db/database.module';
import { AuthGuard } from './modules/auth.guard';
import { AuthService } from './modules/auth.service';
import { CountriesService } from './modules/countries';
import { EntitlementsService } from './modules/entitlements';
import { FeedService } from './modules/feed.service';
import { GuardiansController } from './modules/guardians.controller';
import { GuardiansService } from './modules/guardians.service';
import { InteractionsService } from './modules/interactions.service';
import { MembersService } from './modules/members';
import { AdminGuard } from './modules/admin.guard';
import { ModerationController } from './modules/moderation.controller';
import { ModerationService } from './modules/moderation.service';
import { NotificationsService } from './modules/notifications.service';
import { NotificationsController } from './modules/notifications.controller';
import { NotificationScheduler } from './modules/notification-scheduler';
import { PUSH_DRIVER, createPushDriver } from './modules/push';
import { RealtimeHub } from './modules/realtime';
import { UsageService } from './modules/usage';
import { APP_GUARD } from '@nestjs/core';
import { AccountController } from './modules/account.controller';
import { BillingController } from './modules/billing.controller';
import { BillingService } from './modules/billing.service';
import { DiscoverController } from './modules/discover.controller';
import { PrivacyController } from './modules/privacy.controller';
import { PrivacyService } from './modules/privacy.service';
import { PhotosModule } from './modules/photos.module';

/** Config + database (global) + every service, shared by the HTTP app and the tests. */
@Global()
@Module({
  imports: [DatabaseModule, PhotosModule],
  controllers: [AccountController, DiscoverController, GuardiansController, NotificationsController, BillingController, ModerationController, PrivacyController],
  providers: [
    { provide: CONFIG, useValue: loadConfig() },
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    CountriesService,
    EntitlementsService,
    BillingService,
    UsageService,
    MembersService,
    FeedService,
    InteractionsService,
    GuardiansService,
    NotificationsService,
    ModerationService,
    AdminGuard,
    RealtimeHub,
    { provide: PUSH_DRIVER, useFactory: () => createPushDriver() },
    NotificationScheduler,
    PrivacyService,
  ],
  exports: [CONFIG, AuthService, CountriesService, EntitlementsService, UsageService, MembersService, FeedService, InteractionsService, GuardiansService, NotificationsService, RealtimeHub, PUSH_DRIVER],
})
export class AppModule {}
