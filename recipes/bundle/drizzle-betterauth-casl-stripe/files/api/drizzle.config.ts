import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: ['./src/db/schema.ts', './src/db/auth-schema.ts'],
  out: './drizzle',
  // Migration-only, superuser connection (see docker-compose.yml / enable-rls.sql) — same
  // DATABASE_URL the Prisma bundle's migrations use, never APP_DATABASE_URL.
  dbCredentials: {
    url: process.env.DATABASE_URL as string,
  },
});
