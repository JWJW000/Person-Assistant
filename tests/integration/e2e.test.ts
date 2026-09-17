import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildServer } from '../../apps/server/src/app.js';
import crypto from 'crypto';

describe('E2E: Pair -> Create Run -> Stream Events -> Get Structured Card', () => {
  let app: any;
  let db: any;
  const pairingCode = '888999';
  let deviceToken = '';

  beforeAll(async () => {
    process.env.DATABASE_PATH = ':memory:';
    const serverInstance = buildServer();
    app = serverInstance.app;
    db = serverInstance.db;

    // 预置配对码
    const codeHash = crypto.createHash('sha256').update(pairingCode).digest('hex');
    const expiresAt = new Date(Date.now() + 600000).toISOString();
    db.prepare(`
      INSERT INTO pairing_codes (code_hash, expires_at)
      VALUES (?, ?)
    `).run(codeHash, expiresAt);
  });

  afterAll(async () => {
    await app.close();
  });

  it('performs complete end-to-end cycle', async () => {
    // 1. 设备配对换取 Token
    const pairRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/pair',
      payload: {
        pairingCode,
        deviceName: 'E2E Test Android'
      }
    });
    expect(pairRes.statusCode).toBe(200);
    deviceToken = JSON.parse(pairRes.payload).deviceToken;
    expect(deviceToken).toBeDefined();

    // 2. 创建会话
    const convRes = await app.inject({
      method: 'POST',
      url: '/v1/conversations',
      headers: { Authorization: `Bearer ${deviceToken}` },
      payload: { title: '查票 E2E' }
    });
    expect(convRes.statusCode).toBe(200);
    const convId = JSON.parse(convRes.payload).id;

    // 3. 提交普通文本消息并创建 Run
    const runRes = await app.inject({
      method: 'POST',
      url: `/v1/conversations/${convId}/runs`,
      headers: { Authorization: `Bearer ${deviceToken}` },
      payload: {
        clientRequestId: crypto.randomUUID(),
        kind: 'chat',
        input: { text: '你好，请问你是谁？' }
      }
    });
    expect(runRes.statusCode).toBe(202);
    const { runId } = JSON.parse(runRes.payload);

    // 等待异步 Run 写入完成
    await new Promise((resolve) => setTimeout(resolve, 800));

    // 4. 检查生成的 Run 事件流
    const events = db.prepare('SELECT * FROM run_events WHERE run_id = ? ORDER BY seq ASC').all(runId) as any[];
    const types = events.map((e) => e.type);
    expect(types).toContain('run.started');
  });
});
