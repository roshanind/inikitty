import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import type { PostInstallContext } from '../../../src/engine/types.js';

/** Mirrors apply.ts's own toKebabCase exactly — duplicated rather than imported across the
 * engine/recipe boundary, same as the Prisma bundle's postInstall.ts keeps its own small
 * `prismaTimestamp()` helper rather than reaching into engine internals. Needed to compute the
 * Postgres database name docker-compose.yml was generated with ({{projectNameKebab}}), since
 * postInstall.ts's own process never loads api/.env (only child processes spawned with `cwd:
 * apiDir` do, via their own `dotenv/config` — see auth.ts/drizzle.config.ts). */
function toKebabCase(name: string): string {
  return name
    .trim()
    .replace(/[_\s]+/g, '-')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function run(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${code}`));
    });
  });
}

async function waitForPostgres(cwd: string, attempts = 30): Promise<void> {
  for (let i = 0; i < attempts; i += 1) {
    try {
      await run('docker', ['compose', 'exec', '-T', 'postgres', 'pg_isready', '-U', 'postgres'], cwd);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error('Postgres did not become ready in time.');
}

const MANUAL_STEPS = [
  '',
  'Could not finish auth/database setup automatically. Once Docker/Postgres is available, run:',
  '  docker compose up -d',
  '  cd api',
  '  npx auth generate --yes --output src/db/auth-schema.ts',
  '  npx drizzle-kit generate',
  '  npx drizzle-kit migrate',
  '  # then apply src/db/enable-rls.sql directly against DATABASE_URL as the superuser (it is not',
  "  # tracked in drizzle-kit's own migration journal — see that file's header comment for why).",
  '',
].join('\n');

export default async function postInstall(ctx: PostInstallContext): Promise<void> {
  try {
    // packages/shared ships raw TS with its own `tsc` build (see its package.json) — api/'s and
    // app/'s own builds consume its compiled dist/, which doesn't exist until this runs once.
    await run('pnpm', ['run', 'build'], `${ctx.outputDir}/packages/shared`);
  } catch (err) {
    console.warn(err instanceof Error ? err.message : String(err));
    console.warn('\nCould not build packages/shared automatically — run "pnpm run build" there before starting api/ or app/.\n');
  }

  try {
    await run('docker', ['compose', 'up', '-d'], ctx.outputDir);
    await waitForPostgres(ctx.outputDir);

    const apiDir = `${ctx.outputDir}/api`;
    // Overwrites the placeholder auth-schema.ts (see that file) with the real User/Session/
    // Account/Verification table definitions read off auth.ts's betterAuth() config.
    await run('npx', ['auth', 'generate', '--yes', '--output', 'src/db/auth-schema.ts'], apiDir);
    // Diffs schema.ts + the now-real auth-schema.ts against drizzle-kit's local migration
    // snapshots and writes a new SQL migration file — no live DB connection needed for this step.
    await run('npx', ['drizzle-kit', 'generate'], apiDir);
    // Applies every pending migration to DATABASE_URL (the superuser, migration-only connection —
    // see enable-rls.sql for why the app itself never uses this one).
    await run('npx', ['drizzle-kit', 'migrate'], apiDir);

    // RLS DDL (ENABLE ROW LEVEL SECURITY, CREATE POLICY, CREATE ROLE) applied directly against the
    // running container rather than folded into drizzle-kit's own migration journal — see
    // enable-rls.sql's header comment for why hand-authoring a journal entry was judged too
    // fragile. Idempotent by construction (IF NOT EXISTS / DO blocks throughout), so this is safe
    // to re-run.
    const rlsSql = await readFile(`${apiDir}/src/db/enable-rls.sql`, 'utf8');
    const dbName = toKebabCase(ctx.projectName);
    await run(
      'docker',
      ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'postgres', '-d', dbName, '-v', 'ON_ERROR_STOP=1', '-c', rlsSql],
      ctx.outputDir,
    );
  } catch (err) {
    console.warn(err instanceof Error ? err.message : String(err));
    console.warn(MANUAL_STEPS);
  }
}
