This project needs a real Postgres (via Docker) and a couple of one-time setup commands before the
dev servers actually work — signup/login/tenancy all depend on migrations having run and row-level
security being enabled.

```bash
cp .env.example api/.env   # a working local-dev default is already there
docker compose up -d
cd api
npx auth generate --yes --output src/db/auth-schema.ts
npx drizzle-kit generate
npx drizzle-kit migrate
```

Then apply `api/src/db/enable-rls.sql` directly against `DATABASE_URL` as the superuser (it isn't
folded into drizzle-kit's own migration journal — see that file's header comment for why). The
simplest way locally, from the project root:

```bash
docker compose exec -T postgres psql -U postgres -d <your-project-name> -v ON_ERROR_STOP=1 \
  -f api/src/db/enable-rls.sql
```

(Generating this project through `npx create-inikitty` instead of cloning it runs all of this
automatically — see the generator's own `postInstall.ts`.)

**`api/` requires Node ≥22** (Better Auth's CLI depends on `Object.groupBy`, unavailable on
Node 20) — `nvm use 22` first if your default is older.
