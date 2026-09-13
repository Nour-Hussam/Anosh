/* Spawns an isolated instance of the app (own port + throwaway SQLite file)
   so `npm test` never touches the development database. */
import { spawn, execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

export async function startTestServer() {
  const dir = mkdtempSync(path.join(tmpdir(), 'kj-test-'));
  const dbFile = path.join(dir, 'test.db');
  const port = 3200 + (process.pid % 300);
  const origin = `http://localhost:${port}`;

  const env = {
    ...process.env,
    NODE_ENV: 'test',
    PORT: String(port),
    HOST: '127.0.0.1',
    BASE_URL: origin,
    DATABASE_FILE: dbFile,
    ADMIN_PASSWORD: 'Test-Admin-Pass-123!',
    ADMIN_EMAIL: 'admin@test.local',
    TRUST_PROXY: '0',
    ALLOW_GOOGLE_FONTS: 'false',
    SMTP_HOST: '',
    LOG_LEVEL: 'error',
  };

  // Schema + demo content first…
  execFileSync(process.execPath, ['server/db/seed.js'], { cwd: ROOT, env, stdio: 'pipe' });

  // …then the HTTP server (it also creates the bootstrap admin).
  const child = spawn(process.execPath, ['server/index.js'], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let logs = '';
  child.stdout.on('data', (chunk) => { logs += chunk; });
  child.stderr.on('data', (chunk) => { logs += chunk; });

  const deadline = Date.now() + 20_000;
  for (;;) {
    if (child.exitCode !== null) throw new Error(`test server exited early:\n${logs}`);
    try {
      const res = await fetch(`${origin}/healthz`);
      if (res.ok) break;
    } catch { /* not up yet */ }
    if (Date.now() > deadline) {
      child.kill('SIGKILL');
      throw new Error(`test server did not become healthy:\n${logs}`);
    }
    await new Promise((r) => setTimeout(r, 200));
  }

  return {
    origin,
    admin: { email: env.ADMIN_EMAIL, password: env.ADMIN_PASSWORD },
    stop() {
      child.kill('SIGTERM');
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
