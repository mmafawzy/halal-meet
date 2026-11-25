import { Global, Module, type OnApplicationShutdown } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../config';
import { DB, openDatabase, type Db, type DbHandle } from './client';

/**
 * Owns the database handle. `DB` resolves to the Drizzle instance; the handle itself stays here so the
 * connection is closed on shutdown.
 */
@Global()
@Module({
  providers: [
    {
      provide: DB,
      useFactory: async (config: AppConfig): Promise<Db> => {
        const handle: DbHandle = await openDatabase({
          url: config.databaseUrl,
          dataDir: config.databaseUrl ? null : config.pgliteDir,
        });
        DatabaseModule.handle = handle;
        return handle.db;
      },
      inject: [CONFIG],
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnApplicationShutdown {
  static handle: DbHandle | null = null;

  async onApplicationShutdown(): Promise<void> {
    await DatabaseModule.handle?.close();
    DatabaseModule.handle = null;
  }
}
