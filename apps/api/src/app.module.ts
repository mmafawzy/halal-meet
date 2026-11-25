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
import { UsageService } from './modules/usage';
import { APP_GUARD } from '@nestjs/core';
import { AccountController } from './modules/account.controller';
import { DiscoverController } from './modules/discover.controller';

/** Config + database (global) + every service, shared by the HTTP app and the tests. */
@Global()
@Module({
  imports: [DatabaseModule],
  controllers: [AccountController, DiscoverController, GuardiansController],
  providers: [
    { provide: CONFIG, useValue: loadConfig() },
    { provide: APP_GUARD, useClass: AuthGuard },
    AuthService,
    CountriesService,
    EntitlementsService,
    UsageService,
    MembersService,
    FeedService,
    InteractionsService,
    GuardiansService,
  ],
  exports: [CONFIG, AuthService, CountriesService, EntitlementsService, UsageService, MembersService, FeedService, InteractionsService, GuardiansService],
})
export class AppModule {}
