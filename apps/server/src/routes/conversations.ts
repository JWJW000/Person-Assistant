import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import type { AgentRuntime } from '@assistant/agent-runtime';
import { CreateConversationSchema, CreateRunRequestSchema } from '@assistant/contracts';
import { runEventBus } from '../services/eventBus.js';
import type { AuthenticateFn, DeviceRecord } from './auth.js';

interface RequestWithDevice extends FastifyRequest {
  device?: DeviceRecord;
}

export function registerConversationsRoutes(
  app: FastifyInstance,
  db: Database.Database,
  agentRuntime: AgentRuntime,
  authenticate: AuthenticateFn
): void {
  // 3. 会话管理
  app.get('/v1/conversations', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const items = db.prepare('SELECT * FROM conversations WHERE deleted_at IS NULL ORDER BY updated_at DESC').all();
    return { items };
  });

  app.post('/v1/conversations', async (req: FastifyRequest, reply: FastifyReply) => {
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

  app.delete('/v1/conversations/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const now = new Date().toISOString();
    db.prepare('UPDATE conversations SET deleted_at = ? WHERE id = ?').run(now, id);
    return { success: true, id };
  });

  app.patch('/v1/conversations/:id', async (req: FastifyRequest<{ Params: { id: string }; Body: { title?: string } }>, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const { title } = req.body || {};
    if (title && typeof title === 'string') {
      const now = new Date().toISOString();
      db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title.trim(), now, id);
    }
    return { success: true, id };
  });

  app.get('/v1/conversations/:id/messages', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id) as Array<{
      id: string;
      conversation_id: string;
      run_id?: string | null;
      role: string;
      parts_json: string;
      status: string;
      created_at: string;
    }>;
    const resultStmt = db.prepare('SELECT payload_json FROM query_results WHERE run_id = ?');
    return {
      items: messages.map((m) => {
        let parts: unknown[] = [];
        try {
          parts = JSON.parse(m.parts_json);
        } catch {}
        const ticketsPart = Array.isArray(parts)
          ? parts.find((p: unknown) => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'tickets')
          : null;
        let tickets = (ticketsPart as { tickets?: unknown[] } | null)?.tickets;
        if ((!tickets || !tickets.length) && m.role === 'assistant' && m.run_id) {
          const row = resultStmt.get(m.run_id) as { payload_json?: string } | undefined;
          if (row?.payload_json) {
            try {
              tickets = JSON.parse(row.payload_json)?.tickets;
            } catch {}
          }
        }
        return { ...m, parts, tickets: Array.isArray(tickets) ? tickets : [] };
      })
    };
  });

  // 4. Run 调度与执行
  app.post('/v1/conversations/:id/runs', async (req: RequestWithDevice, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { id: conversationId } = req.params as { id: string };
    const parsed = CreateRunRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: 'Run 参数不合法' } });
    }

    const { clientRequestId, kind, input } = parsed.data;
    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = new Date().toISOString();
    const deviceId = req.device?.id;

    // 确保会话存在 (客户端可能直接使用 default 等隐式会话 ID)
    db.prepare(`
      INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, '新的查询与会话', now, now);

    // 检查幂等性
    const existing = db.prepare('SELECT * FROM runs WHERE device_id = ? AND client_request_id = ?').get(deviceId, clientRequestId) as
      | { id: string; status: string }
      | undefined;
    if (existing) {
      return { runId: existing.id, status: existing.status, eventsUrl: `/v1/runs/${existing.id}/events` };
    }

    db.prepare(`
      INSERT INTO runs (id, device_id, conversation_id, client_request_id, kind, status, started_at)
      VALUES (?, ?, ?, ?, ?, 'running', ?)
    `).run(runId, deviceId, conversationId, clientRequestId, kind, now);

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

        // 读取本会话最近 20 条已完成消息，倒序取出后再正序传给模型
        const pastRows = db.prepare(`
          SELECT role, parts_json FROM messages
          WHERE conversation_id = ? AND run_id <> ? AND status = 'completed'
          ORDER BY created_at DESC LIMIT 20
        `).all(conversationId, runId) as Array<{ role: string; parts_json: string }>;
        pastRows.reverse();

        const history: Array<{ role: 'user' | 'assistant'; text: string }> = [];
        for (const row of pastRows) {
          try {
            const parts = JSON.parse(row.parts_json);
            const t = Array.isArray(parts) ? parts.find((p: unknown) => typeof p === 'object' && p !== null && (p as { type?: string }).type === 'text')?.text || '' : '';
            if (t) {
              history.push({ role: row.role as 'user' | 'assistant', text: t });
            }
          } catch {}
        }

        let lastTickets: unknown[] = [];
        await agentRuntime.executeRun(
          {
            runId,
            userMessage: input.text || '查票',
            currentDate: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),
            history
          },
          (event) => {
            db.prepare(`
              INSERT INTO run_events (run_id, seq, type, payload_json, created_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(runId, event.seq, event.type, JSON.stringify(event.payload), event.occurredAt);
            runEventBus.publish(runId, event);

            if (event.type === 'result.ready') {
              const payload = event.payload as { result?: { id?: string; tickets?: unknown[]; schemaVersion?: number; fetchedAt?: string; parentResultId?: string } };
              const result = payload?.result;
              if (result && result.id) {
                if (Array.isArray(result.tickets)) lastTickets = result.tickets;
                db.prepare(`
                  INSERT OR REPLACE INTO query_results (id, run_id, schema_version, payload_json, fetched_at, parent_id)
                  VALUES (?, ?, ?, ?, ?, ?)
                `).run(
                  result.id,
                  runId,
                  result.schemaVersion || 1,
                  JSON.stringify(result),
                  result.fetchedAt || new Date().toISOString(),
                  result.parentResultId || null
                );
              }
            }

            if (event.type === 'message.completed') {
              const payload = event.payload as { fullText?: string };
              const parts: unknown[] = [{ type: 'text', text: payload?.fullText || '' }];
              if (lastTickets.length) {
                parts.push({ type: 'tickets', tickets: lastTickets });
              }
              db.prepare(`
                INSERT INTO messages (id, conversation_id, run_id, role, parts_json, status, created_at)
                VALUES (?, ?, ?, 'assistant', ?, 'completed', ?)
              `).run(`msg_${Date.now()}`, conversationId, runId, JSON.stringify(parts), new Date().toISOString());
            }

            if (event.type === 'run.completed') {
              db.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?').run('succeeded', new Date().toISOString(), runId);
            } else if (event.type === 'run.failed') {
              db.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?').run('failed', new Date().toISOString(), runId);
            }
          }
        );
      } catch {
        db.prepare('UPDATE runs SET status = ?, finished_at = ? WHERE id = ?').run('failed', new Date().toISOString(), runId);
      }
    }, 10);

    reply.status(202).send({
      runId,
      status: 'queued',
      eventsUrl: `/v1/runs/${runId}/events`
    });
  });

  // 6. 结果与收藏
  app.get('/v1/results/:id', async (req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const row = db.prepare('SELECT * FROM query_results WHERE id = ?').get(id) as { payload_json: string } | undefined;
    if (!row) {
      return { id, tickets: [], warnings: [] };
    }
    return JSON.parse(row.payload_json);
  });

  app.get('/v1/favorites', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const items = db.prepare('SELECT * FROM favorites ORDER BY created_at DESC').all() as Array<{ query_json: string; [key: string]: unknown }>;
    return { items: items.map((f) => ({ ...f, query: JSON.parse(f.query_json) })) };
  });

  app.post('/v1/favorites', async (req: FastifyRequest<{ Body: { name?: string; query: unknown; snapshotResultId?: string } }>, reply: FastifyReply) => {
    if (!authenticate(req, reply)) return;
    const { name, query, snapshotResultId } = req.body || {};
    const id = `fav_${Date.now()}`;
    db.prepare(`
      INSERT INTO favorites (id, name, query_json, snapshot_result_id, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, name || '收藏车次', JSON.stringify(query), snapshotResultId || null, new Date().toISOString());
    return { id, name, query, snapshotResultId };
  });
}
