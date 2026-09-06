This project needs a real Postgres (via Docker) and a couple of one-time setup commands before the
dev servers actually work — signup/login/tenancy all depend on migrations having run and row-level
security being enabled.

```bash
cp .env.example api/.env   # a working local-dev default is already there
docker compose up -d
cd api
npx prisma generate
npx auth generate --yes
npx prisma migrate dev --name init
npx prisma generate
```

Then copy `api/prisma/enable-rls.sql`'s contents into a new, timestamped
`api/prisma/migrations/<YYYYMMDDHHmmss>_enable_rls/migration.sql` and run
`npx prisma migrate deploy` from `api/`. (Generating this project through `npx create-inikitty`
instead of cloning it runs all of this automatically — see the generator's own `postInstall.ts`.)

**`api/` requires Node ≥22** (Better Auth's CLI depends on `Object.groupBy`, unavailable on
Node 20) — `nvm use 22` first if your default is older.
