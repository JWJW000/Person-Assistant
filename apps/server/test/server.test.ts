import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../src/app.js';
import crypto from 'crypto';

describe('Server HTTP API & Auth Integration', () => {
  let app: any;
  let db: any;
  const testPairingCode = '123456';
  let deviceToken = '';

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    const serverInstance = buildServer();
    app = serverInstance.app;
    db = serverInstance.db;

    // 预先插入一条配对码
    const codeHash = crypto.createHash('sha256').update(testPairingCode).digest('hex');
    const expiresAt = new Date(Date.now() + 600000).toISOString();
    db.prepare(`
      INSERT INTO pairing_codes (code_hash, expires_at)
      VALUES (?, ?)
    `).run(codeHash, expiresAt);
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /healthz returns status ok', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/healthz'
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.status).toBe('ok');
  });

  it('POST /v1/auth/pair exchanges token once', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/pair',
      payload: {
        pairingCode: testPairingCode,
        deviceName: 'Android Test Phone'
      }
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.deviceToken).toBeDefined();
    deviceToken = json.deviceToken;

    // 再次兑换应该失败 (单次消费)
    const secondRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/pair',
      payload: {
        pairingCode: testPairingCode,
        deviceName: 'Android Test Phone'
      }
    });
    expect(secondRes.statusCode).toBe(401);
  });

  it('Rejects unauthenticated requests to conversations', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/conversations'
    });
    expect(res.statusCode).toBe(401);
  });

  it('Creates and lists conversations with valid Bearer token', async () => {
    const createRes = await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers: {
        Authorization: `Bearer ${deviceToken}`
      },
      payload: {
        title: '北京到洛阳车票'
      }
    });
    expect(createRes.statusCode).toBe(200);
    const conv = JSON.parse(createRes.payload);
    expect(conv.id).toBeDefined();

    const listRes = await app.inject({
      method: 'GET',
      url: '/v1/conversations',
      headers: {
        Authorization: `Bearer ${deviceToken}`
      }
    });
    expect(listRes.statusCode).toBe(200);
    const list = JSON.parse(listRes.payload);
    expect(list.items).toHaveLength(1);
    expect(list.items[0].title).toBe('北京到洛阳车票');
  });

  it('returns run event deltas via JSON poll', async () => {
    const device = db.prepare('SELECT id FROM devices LIMIT 1').get() as { id: string };
    expect(device?.id).toBeTruthy();

    const runId = 'run_stream_test';
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO runs (id, device_id, conversation_id, client_request_id, kind, status, started_at)
      VALUES (?, ?, ?, ?, 'chat', 'running', ?)
    `).run(runId, device.id, 'default', 'client_stream_test', now);
    db.prepare(`
      INSERT INTO run_events (run_id, seq, type, payload_json, created_at)
      VALUES (?, 1, 'message.delta', ?, ?)
    `).run(runId, JSON.stringify({ delta: '你', fullText: '你' }), now);
    db.prepare(`
      INSERT INTO run_events (run_id, seq, type, payload_json, created_at)
      VALUES (?, 2, 'message.delta', ?, ?)
    `).run(runId, JSON.stringify({ delta: '好', fullText: '你好' }), now);

    const res = await app.inject({
      method: 'GET',
      url: `/v1/runs/${runId}/events?format=json&after=0`,
      headers: { Authorization: `Bearer ${deviceToken}` }
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.payload);
    expect(json.items).toHaveLength(2);
    expect(json.items[0].type).toBe('message.delta');
    expect(json.items[1].payload.fullText).toBe('你好');

    const res2 = await app.inject({
      method: 'GET',
      url: `/v1/runs/${runId}/events?format=json&after=1`,
      headers: { Authorization: `Bearer ${deviceToken}` }
    });
    expect(res2.statusCode).toBe(200);
    const json2 = JSON.parse(res2.payload);
    expect(json2.items).toHaveLength(1);
    expect(json2.items[0].seq).toBe(2);
  });
});
