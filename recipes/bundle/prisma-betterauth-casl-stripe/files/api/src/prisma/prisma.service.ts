import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    // The app's own runtime connects as the limited `app_role` (subject to row-level security),
    // never as the `DATABASE_URL` superuser that migrations use — see enable-rls.sql.
    const databaseUrl = process.env.APP_DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('APP_DATABASE_URL is not set.');
    }
    super({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
