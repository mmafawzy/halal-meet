import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DB, type Db } from '../db/client';
import { Public } from '../common/http';
import { RealtimeHub } from './realtime';

/** Liveness/readiness probe for load balancers and container platforms. Public; reveals no data. */
@Controller()
export class HealthController {
  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(RealtimeHub) private readonly realtime: RealtimeHub,
  ) {}

  @Public()
  @Get('health')
  async health(): Promise<{ status: 'ok'; database: 'ok'; realtime: string }> {
    try {
      await this.db.execute(sql`select 1`);
    } catch {
      throw new ServiceUnavailableException({ status: 'unavailable', database: 'down' });
    }
    return { status: 'ok', database: 'ok', realtime: this.realtime.transport };
  }
}
