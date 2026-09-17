import fastify from 'fastify';
import cors from '@fastify/cors';
import { createDatabase, migrate } from './db/index.js';
import { McpBridge } from '@assistant/mcp-bridge';
import { TrainService } from '@assistant/train-domain';
import { AgentRuntime } from '@assistant/agent-runtime';
import crypto from 'crypto';
import {
  PairRequestSchema,
  CreateConversationSchema,
  CreateRunRequestSchema,
  TicketQuerySchema
} from '@assistant/contracts';

export function buildServer(): { app: any; db: any } {
  const app = fastify({ logger: false });
  const db = createDatabase();
  migrate(db);

  // 跨域支持 (为开发和 Tauri WebView 准备)
  app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS']
  });

  const mcpBridge = new McpBridge({
    entrypoint: process.env.MCP_ENTRYPOINT
  });
  const trainService = new TrainService(mcpBridge);
  const agentRuntime = new AgentRuntime(trainService);

  // 1. 健康检查
  app.get('/healthz', async () => {
    return { status: 'ok', time: new Date().toISOString() };
  });

  // 2. 配对兑换设备 Token
  app.post('/v1/auth/pair', async (req, reply) => {
    const body = PairRequestSchema.safeParse(req.body);
    if (!body.success) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: '请求参数无效' } });
    }

    const { pairingCode, deviceName } = body.data;
    const codeHash = crypto.createHash('sha256').update(pairingCode).digest('hex');

    const row = db.prepare('SELECT * FROM pairing_codes WHERE code_hash = ?').get(codeHash) as any;
    if (!row || row.consumed_at || new Date(row.expires_at).getTime() < Date.now()) {
      return reply.status(401).send({ error: { code: 'AUTH_REQUIRED', message: '配对码无效或已过期' } });
    }

    // 消费配对码
    db.prepare('UPDATE pairing_codes SET consumed_at = ? WHERE code_hash = ?').run(new Date().toISOString(), codeHash);

    // 发行设备 Token
    const deviceId = `dev_${crypto.randomUUID()}`;
    const deviceToken = `tok_${crypto.randomBytes(24).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(deviceToken).digest('hex');
    const expiresAt = new Date(Date.now() + 90 * 24 * 3600 * 1000).toISOString();

    db.prepare(`
      INSERT INTO devices (id, name, token_hash, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(deviceId, deviceName, tokenHash, new Date().toISOString(), expiresAt);

    return {
      deviceId,
      deviceToken,
      expiresAt
    };
  });

  // 设备认证中间件钩子
  const authenticate = (req: any, reply: any) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      reply.status(401).send({ error: { code: 'AUTH_REQUIRED', message: '需要有效的设备凭证' } });
      return false;
    }
    const token = authHeader.slice(7);
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const device = db.prepare('SELECT * FROM devices WHERE token_hash = ?').get(tokenHash) as any;

    if (!device || device.revoked_at || new Date(device.expires_at).getTime() < Date.now()) {
      reply.status(401).send({ error: { code: 'DEVICE_REVOKED', message: '设备已被注销或凭据已失效' } });
      return false;
    }
    req.device = device;
    return true;
  };

  // 3. 会话管理
  app.get('/v1/conversations', async (req, reply) => {
    if (!authenticate(req, reply)) return;
    const items = db.prepare('SELECT * FROM conversations WHERE deleted_at IS NULL ORDER BY updated_at DESC').all();
    return { items };
  });

  app.post('/v1/conversations', async (req, reply) => {
    if (!authenticate(req, reply)) return;
    const body = CreateConversationSchema.parse(req.body || {});
    const id = `conv_${Date.now()}`;
    const now = new Date().toISOString();
    const title = body.title || '新的查询与会话';

    db.prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(id, title, now, now);

    return { id, title, createdAt: now, updatedAt: now };
  });

  app.get('/v1/conversations/:id/messages', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
    return { items: messages.map((m: any) => ({ ...m, parts: JSON.parse(m.parts_json) })) };
  });

  // 4. Run 调度与执行
  app.post('/v1/conversations/:id/runs', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { id: conversationId } = req.params;
    const parsed = CreateRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: 'Run 参数不合法' } });
    }

    const { clientRequestId, kind, input } = parsed.data;
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();

    // 检查幂等性
    const existing = db.prepare('SELECT * FROM runs WHERE device_id = ? AND client_request_id = ?').get(req.device.id, clientRequestId) as any;
    if (existing) {
      return { runId: existing.id, status: existing.status, eventsUrl: `/v1/runs/${existing.id}/events` };
    }

    db.prepare(`
      INSERT INTO runs (id, device_id, conversation_id, client_request_id, kind, status, started_at)
      VALUES (?, ?, ?, ?, ?, 'running', ?)
    `).run(runId, req.device.id, conversationId, clientRequestId, kind, now);

    // 异步后台运行，结果写入事件库
    setTimeout(async () => {
      try {
        if (input.text) {
          // 插入用户消息
          db.prepare(`
            INSERT INTO messages (id, conversation_id, run_id, role, parts_json, status, created_at)
            VALUES (?, ?, ?, 'user', ?, 'completed', ?)
          `).run(`msg_${Date.now()}`, conversationId, runId, JSON.stringify([{ type: 'text', text: input.text }]), new Date().toISOString());
        }

        await agentRuntime.executeRun(
          {
            runId,
            userMessage: input.text || '查票'
          },
          (event: any) => {
            db.prepare(`
              INSERT INTO run_events (run_id, seq, type, payload_json, created_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(runId, event.seq, event.type, JSON.stringify(event.payload), event.occurredAt);

            if (event.type === 'message.completed') {
              db.prepare(`
                INSERT INTO messages (id, conversation_id, run_id, role, parts_json, status, created_at)
                VALUES (?, ?, ?, 'assistant', ?, 'completed', ?)
              `).run(`msg_${Date.now()}`, conversationId, runId, JSON.stringify([{ type: 'text', text: event.payload.fullText }]), new Date().toISOString());
            }

            if (event.type === 'run.completed') {
              db.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?').run('succeeded', new Date().toISOString(), runId);
            } else if (event.type === 'run.failed') {
              db.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?').run('failed', new Date().toISOString(), runId);
            }
          }
        );
      } catch (err) {
        db.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?').run('failed', new Date().toISOString(), runId);
      }
    }, 10);

    reply.status(202).send({
      runId,
      status: 'queued',
      eventsUrl: `/v1/runs/${runId}/events`
    });
  });

  // 5. SSE 事件流 (可恢复)
  app.get('/v1/runs/:id/events', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { id: runId } = req.params;
    const after = parseInt(req.query.after || '0', 10);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });

    let currentSeq = after;
    const sendEvent = (event: any) => {
      reply.raw.write(`id: ${event.seq}\n`);
      reply.raw.write(`event: ${event.type}\n`);
      reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // 补全历史事件
    const pastEvents = db.prepare('SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC').all(runId, currentSeq) as any[];
    for (const e of pastEvents) {
      sendEvent({
        v: 1,
        runId: e.run_id,
        seq: e.seq,
        type: e.type,
        occurredAt: e.created_at,
        payload: JSON.parse(e.payload_json)
      });
      currentSeq = e.seq;
    }

    // 轮询检查后续事件直至终态
    const interval = setInterval(() => {
      const newEvents = db.prepare('SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC').all(runId, currentSeq) as any[];
      for (const e of newEvents) {
        sendEvent({
          v: 1,
          runId: e.run_id,
          seq: e.seq,
          type: e.type,
          occurredAt: e.created_at,
          payload: JSON.parse(e.payload_json)
        });
        currentSeq = e.seq;
      }

      const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as any;
      if (run && (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled')) {
        clearInterval(interval);
        reply.raw.end();
      }
    }, 200);

    req.raw.on('close', () => {
      clearInterval(interval);
    });
  });

  // 6. 结果与收藏
  app.get('/v1/results/:id', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM query_results WHERE id = ?').get(id) as any;
    if (!row) {
      // 容错返回空票卡数据
      return { id, tickets: [], warnings: [] };
    }
    return JSON.parse(row.payload_json);
  });

  app.get('/v1/favorites', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const items = db.prepare('SELECT * FROM favorites ORDER BY created_at DESC').all();
    return { items: items.map((f: any) => ({ ...f, query: JSON.parse(f.query_json) })) };
  });

  app.post('/v1/favorites', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { name, query, snapshotResultId } = req.body;
    const id = `fav_${Date.now()}`;
    db.prepare(`
      INSERT INTO favorites (id, name, query_json, snapshot_result_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name || '收藏车次', JSON.stringify(query), snapshotResultId || null, new Date().toISOString());
    return { id, name, query, snapshotResultId };
  });

  return { app, db };
}
