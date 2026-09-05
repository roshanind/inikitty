import { type ChildProcess, spawn } from 'node:child_process';
import request from 'supertest';

/**
 * Black-box e2e: spawns the REAL compiled server (`node dist/main.js`), not an in-process Nest
 * `TestingModule`. This is what lets it survive whatever a bundle recipe injects into
 * `AppModule` — including ESM-only dependencies that Jest's own CommonJS module loader can't
 * import directly even with a transform configured (a real, hit-in-practice case — see
 * recipes/README.md). Requires `pnpm build` to have already run.
 */

const PORT = Number(process.env.E2E_PORT ?? 4098);
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT_MS = 15_000;

let server: ChildProcess;

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

beforeAll(async () => {
  server = spawn('node', ['dist/main.js'], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });
  await waitForServer(`${BASE_URL}/health`, Date.now() + STARTUP_TIMEOUT_MS);
}, STARTUP_TIMEOUT_MS + 5_000);

afterAll(() => {
  server.kill();
});

describe('AppController (e2e)', () => {
  it('GET /health', () => {
    return request(BASE_URL).get('/health').expect(200).expect({ status: 'ok' });
  });
});
