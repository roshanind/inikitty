import 'dotenv/config';
import { type ChildProcess, spawn } from 'node:child_process';
import { PrismaPg } from '@prisma/adapter-pg';
import request from 'supertest';
import { PrismaClient } from '../src/generated/prisma/client';

/**
 * Black-box e2e: spawns the REAL compiled server (`node dist/main.js`), not an in-process Nest
 * `TestingModule`. `main.ts`'s bootstrap (bodyParser disabled + custom per-route body parsing,
 * `ClassSerializerInterceptor`, CORS) is nontrivial enough that reconstructing it inside a test's
 * own bootstrap would risk testing something subtly different from what's actually deployed.
 *
 * Requires (same as the manual verification process described in recipes/README.md): a real
 * Postgres reachable via `DATABASE_URL`/`APP_DATABASE_URL` with migrations already applied
 * (`docker compose up -d`, then `postInstall.ts`'s steps — or just a real generated + installed
 * project), and `pnpm build` already run in `api/` so `dist/main.js` exists.
 */

const PORT = Number(process.env.E2E_PORT ?? 4099);
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT_MS = 30_000;
const PASSWORD = 'password123!';

let server: ChildProcess;
// Bypasses RLS deliberately, connecting as the migration superuser — the same legitimate escape
// hatch migrations/postInstall.ts use — only for the role-downgrade test setup below, never
// anything a real request path does.
const rawPrisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

function waitForServer(url: string, deadline: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      fetch(url)
        .then((response) => (response.ok ? resolve() : retry()))
        .catch(retry);
    };
    const retry = () => {
      if (Date.now() > deadline) {
        reject(new Error(`Server at ${url} did not become ready in time.`));
        return;
      }
      setTimeout(attempt, 300);
    };
    attempt();
  });
}

function uniqueEmail(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
}

async function signUpAndSignIn(name: string, email: string) {
  const agent = request.agent(BASE_URL);
  await agent.post('/auth/sign-up/email').send({ email, password: PASSWORD, name }).expect(200);
  await agent.post('/auth/sign-in/email').send({ email, password: PASSWORD }).expect(200);
  return agent;
}

beforeAll(async () => {
  server = spawn('node', ['dist/main.js'], {
    env: { ...process.env, PORT: String(PORT), NODE_ENV: 'test' },
    stdio: 'inherit',
  });
  await waitForServer(`${BASE_URL}/health`, Date.now() + STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(async () => {
  server.kill();
  await rawPrisma.$disconnect();
});

describe('golden path', () => {
  it('signup -> session -> project CRUD, response DTO excludes tenantId', async () => {
    const agent = await signUpAndSignIn('Owner A', uniqueEmail('owner-a'));

    const me = await agent.get('/tenants/me').expect(200);
    expect(me.body.role).toBe('owner');

    const created = await agent.post('/projects').send({ name: 'Golden Path Project' }).expect(201);
    expect(created.body).toMatchObject({ name: 'Golden Path Project' });
    expect(created.body.tenantId).toBeUndefined();

    const list = await agent.get('/projects').expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].id).toBe(created.body.id);

    await agent.patch(`/projects/${created.body.id}`).send({ name: 'Renamed' }).expect(200);
    await agent.delete(`/projects/${created.body.id}`).expect(200);
    await agent.get(`/projects/${created.body.id}`).expect(404);
  });

  it('cross-tenant isolation: a second tenant sees an empty list and 404s on direct access', async () => {
    const agentA = await signUpAndSignIn('Tenant A', uniqueEmail('tenant-a'));
    const projectA = await agentA.post('/projects').send({ name: 'Tenant A Project' }).expect(201);

    const agentB = await signUpAndSignIn('Tenant B', uniqueEmail('tenant-b'));

    const listB = await agentB.get('/projects').expect(200);
    expect(listB.body).toEqual([]);

    // Not a leak: a cross-tenant row and a genuinely missing row both 404 identically.
    await agentB.get(`/projects/${projectA.body.id}`).expect(404);
  });

  it('RBAC: a member is rejected on update/delete but still allowed read/create', async () => {
    const agent = await signUpAndSignIn('RBAC Owner', uniqueEmail('rbac'));
    const project = await agent.post('/projects').send({ name: 'RBAC Project' }).expect(201);
    const me = await agent.get('/tenants/me').expect(200);

    // No invite-a-teammate flow exists yet (see CLAUDE.md's tenancy notes) — downgrading this
    // user's own membership directly is the only way to exercise a non-owner role at all.
    await rawPrisma.membership.updateMany({
      where: { tenantId: me.body.tenant.id },
      data: { role: 'member' },
    });

    await agent.patch(`/projects/${project.body.id}`).send({ name: 'nope' }).expect(403);
    await agent.delete(`/projects/${project.body.id}`).expect(403);
    await agent.get(`/projects/${project.body.id}`).expect(200);
    await agent.post('/projects').send({ name: 'Member Created' }).expect(201);
  });
});
