import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';

@Injectable()
export class DbService implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;
  readonly db: NodePgDatabase<typeof schema>;

  constructor() {
    // The app's own runtime connects as the limited `app_role` (subject to row-level security),
    // never as the `DATABASE_URL` superuser that migrations use — see enable-rls.sql.
    const databaseUrl = process.env.APP_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('APP_DATABASE_URL is not set.');
    }
    this.pool = new Pool({ connectionString: databaseUrl });
    this.db = drizzle(this.pool, { schema });
  }

  async onModuleInit(): Promise<void> {
    await this.pool.query('SELECT 1');
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
