import crypto from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildServer } from '../src/app.js';

describe('Pi gateway ownership and idempotency', () => {
  let app: any;
  let db: any;
  const auth = { authorization: 'Bearer test-internal-token', 'x-pi-user-id': 'user-1', 'x-pi-tenant-id': 'default' };
  const projectId = crypto.randomUUID();

  beforeAll(() => {
    process.env.DATABASE_PATH = ':memory:';
    process.env.PI_INTERNAL_TOKEN = 'test-internal-token';
    ({ app, db } = buildServer());
    const hostId = crypto.randomUUID();
    db.prepare(`INSERT INTO pi_hosts (id,owner_user_id,tenant_id,name,platform,credential_hash,expires_at)
      VALUES (?,?,?,?,?,?,?)`).run(hostId, 'user-1', 'default', 'Mac', 'darwin', 'hash', new Date(Date.now() + 60_000).toISOString());
    db.prepare('INSERT INTO pi_projects (id,host_id,runner_project_key,name,display_path) VALUES (?,?,?,?,?)')
      .run(projectId, hostId, 'repo', 'Repo', '/tmp/repo');
  });

  afterAll(async () => { await app.close(); });

  it('requires the internal service identity', async () => {
    expect((await app.inject({ method: 'GET', url: '/internal/pi/hosts' })).statusCode).toBe(401);
  });

  it('atomically consumes a pairing code once', async () => {
    const issued = await app.inject({ method: 'POST', url: '/internal/pi/pairing-codes', headers: auth });
    const code = issued.json().code;
    const attempts = await Promise.all([1, 2].map((n) => app.inject({ method: 'POST', url: '/runner/v1/pair', payload: { pairingCode: code, name: `Linux ${n}`, platform: 'linux' } })));
    expect(attempts.map((result) => result.statusCode).sort()).toEqual([200, 401]);
  });

  it('replays the same create request and rejects a changed body', async () => {
    const clientRequestId = crypto.randomUUID();
    const payload = { clientRequestId, projectId, title: 'Implement feature' };
    const first = await app.inject({ method: 'POST', url: '/internal/pi/tasks', headers: auth, payload });
    const replay = await app.inject({ method: 'POST', url: '/internal/pi/tasks', headers: auth, payload });
    const conflict = await app.inject({ method: 'POST', url: '/internal/pi/tasks', headers: auth, payload: { ...payload, title: 'Different' } });
    expect(first.statusCode).toBe(201);
    expect(replay.json().id).toBe(first.json().id);
    expect(conflict.statusCode).toBe(409);
  });

  it('does not expose another user task', async () => {
    const taskId = (db.prepare('SELECT id FROM pi_tasks LIMIT 1').get() as any).id;
    const result = await app.inject({ method: 'GET', url: `/internal/pi/tasks/${taskId}`, headers: { ...auth, 'x-pi-user-id': 'other' } });
    expect(result.statusCode).toBe(404);
  });
});
