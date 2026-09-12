import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import type { PostInstallContext } from '../../../src/engine/types.js';

/** Matches Prisma's own migration folder naming (YYYYMMDDHHmmss_description). */
function prismaTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`
  );
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
  '  npx prisma generate                 # produces an initial client so auth.ts can import it',
  '  npx auth generate --yes             # reads auth.ts, adds its models to schema.prisma',
  '  npx prisma migrate dev --name init  # creates + applies the migration',
  '  npx prisma generate                 # re-embeds the now-updated schema into the client',
  '  # then copy prisma/enable-rls.sql into a new prisma/migrations/<timestamp>_enable_rls/',
  '  # folder and run: npx prisma migrate deploy',
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
    // `auth generate` imports auth.ts to read the config, which imports the generated Prisma
    // client — so an initial `prisma generate` (against the schema's datasource/generator blocks
    // alone, no models yet) has to happen first or that import fails.
    await run('npx', ['prisma', 'generate'], apiDir);
    await run('npx', ['auth', 'generate', '--yes'], apiDir);
    await run('npx', ['prisma', 'migrate', 'dev', '--name', 'init'], apiDir);
    // `migrate dev` does not reliably re-embed the updated schema into the generated client (the
    // client's own bundled schema.prisma copy was observed staying stale otherwise, causing every
    // model accessor to be undefined at runtime) — force a final regenerate to be sure.
    await run('npx', ['prisma', 'generate'], apiDir);

    // RLS DDL (ENABLE ROW LEVEL SECURITY, CREATE POLICY, CREATE ROLE) isn't expressible in
    // schema.prisma, so it can't come from the schema diff `migrate dev` just applied. Turning it
    // into a real, timestamped migration (rather than an untracked `prisma db execute`) means it's
    // tracked in _prisma_migrations and replays correctly via `migrate deploy` in any environment.
    // The timestamp is real (now), so it always sorts after "init" above.
    const rlsSql = await readFile(`${apiDir}/prisma/enable-rls.sql`, 'utf8');
    const rlsMigrationDir = `${apiDir}/prisma/migrations/${prismaTimestamp()}_enable_rls`;
    await mkdir(rlsMigrationDir, { recursive: true });
    await writeFile(`${rlsMigrationDir}/migration.sql`, rlsSql, 'utf8');
    await run('npx', ['prisma', 'migrate', 'deploy'], apiDir);
  } catch (err) {
    console.warn(err instanceof Error ? err.message : String(err));
    console.warn(MANUAL_STEPS);
  }
}
