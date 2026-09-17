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
});
