import { spawn } from 'node:child_process';
import type { PostInstallContext } from '../../../src/engine/types.js';

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
  '',
].join('\n');

export default async function postInstall(ctx: PostInstallContext): Promise<void> {
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
  } catch (err) {
    console.warn(err instanceof Error ? err.message : String(err));
    console.warn(MANUAL_STEPS);
  }
}
