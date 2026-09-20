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
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'Accept', 'Last-Event-ID'],
    exposedHeaders: ['Content-Type']
  });

  type RunEventListener = (event: any) => void;
  const runListeners = new Map<string, Set<RunEventListener>>();

  const subscribeRunEvents = (runId: string, listener: RunEventListener) => {
    let set = runListeners.get(runId);
    if (!set) {
      set = new Set();
      runListeners.set(runId, set);
    }
    set.add(listener);
    return () => {
      set!.delete(listener);
      if (set!.size === 0) runListeners.delete(runId);
    };
  };

  const publishRunEvent = (runId: string, event: any) => {
    const set = runListeners.get(runId);
    if (!set) return;
    for (const listener of set) {
      try {
        listener(event);
      } catch {}
    }
  };

  const mapEventRow = (row: any) => ({
    v: 1,
    runId: row.run_id,
    seq: row.seq,
    type: row.type,
    occurredAt: row.created_at,
    payload: JSON.parse(row.payload_json)
  });

  const mcpBridge = new McpBridge({
    entrypoint: process.env.MCP_ENTRYPOINT
  });
  const trainService = new TrainService(mcpBridge);

  // 中转站配置：优先读取数据库中用户保存的配置，其次回退到环境变量
  const resolveRelayConfig = () => {
    let baseUrl = process.env.RELAY_BASE_URL || '';
    let api = process.env.RELAY_API || 'openai-completions';
    let modelId = process.env.RELAY_MODEL_ID || '';
    let apiKey = process.env.RELAY_API_KEY || '';
    let enabled = true;

    const row = db.prepare('SELECT * FROM model_profiles WHERE id = ?').get('default') as any;
    if (row) {
      baseUrl = row.base_url || baseUrl;
      api = row.api || api;
      modelId = row.model_id || modelId;
      if (row.secret_ciphertext) {
        apiKey = Buffer.from(row.secret_ciphertext, 'base64').toString('utf-8');
      }
      enabled = Boolean(row.enabled);
    }

    if (process.env.AGENT_LLM_ENABLED === 'false') enabled = false;

    return {
      baseUrl,
      api,
      modelId,
      apiKey,
      enabled,
      timeoutMs: parseInt(process.env.RELAY_TIMEOUT_MS || '30000', 10),
      maxSummaryTickets: parseInt(process.env.MODEL_SUMMARY_MAX_TICKETS || '20', 10)
    };
  };

  const agentRuntime = new AgentRuntime(trainService, resolveRelayConfig);

  // 1. 健康检查
  app.get('/healthz', async () => {
    return { status: 'ok', time: new Date().toISOString() };
  });

  // 1.1 内部 12306 实时查票与解析接口 (供 RuoYi-Vue-Plus AI 中台直接调用)
  app.post('/internal/train/query', async (req: any, reply: any) => {
    try {
      const { userMessage, from, to, date } = req.body || {};
      const currentDate = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

      let queryFrom = from;
      let queryTo = to;
      let queryDate = date;

      if (!queryFrom || !queryTo) {
        // 使用 AgentRuntime 智能解析文本中的城市与日期
        const parsedQuery = agentRuntime.parseQueryFromText(userMessage || '', currentDate);
        queryFrom = parsedQuery?.from?.name || '北京';
        queryTo = parsedQuery?.to?.name || '上海';
        queryDate = queryDate || parsedQuery?.date || currentDate;
      }

      if (!queryDate) {
        queryDate = currentDate;
      }

      
      // 深度清洗站名，去除意外带入的动词、连词及修饰后缀 (如 "上海的高铁车次与" -> "上海")
      const cleanStation = (name) =>
        String(name || "")
          .replace(/(?:的|高铁|动车|火车|列车|车次|车票|余票|票价|班次|时刻|与|和|及).*$/, "")
          .replace(/^[从去坐乘坐到至]+/, "")
          .replace(/[站市县区]$/, "")
          .trim();
      queryFrom = cleanStation(queryFrom) || "北京";
      queryTo = cleanStation(queryTo) || "上海";

      const tickets = await mcpBridge.getTickets(queryFrom, queryTo, queryDate);
      return {
        success: true,
        from: queryFrom,
        to: queryTo,
        date: queryDate,
        count: tickets.length,
        tickets: tickets.slice(0, 15) // 返回前 15 趟最匹配车次
      };
    } catch (err: any) {
      return reply.status(500).send({
        success: false,
        error: err?.message || '12306 MCP 查询失败'
      });
    }
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
  const authenticate = (req: any, reply: any, opts: { allowQueryToken?: boolean } = {}) => {
    let authHeader = req.headers['authorization'];
    // SSE (EventSource) 无法自定义请求头，仅该端点允许通过查询参数回退传递凭证
    if (
      opts.allowQueryToken &&
      (!authHeader || !String(authHeader).startsWith('Bearer ')) &&
      req.query &&
      req.query.access_token
    ) {
      authHeader = `Bearer ${req.query.access_token}`;
    }
    if (!authHeader || !String(authHeader).startsWith('Bearer ')) {
      reply.status(401).send({ error: { code: 'AUTH_REQUIRED', message: '需要有效的设备凭证' } });
      return false;
    }
    const token = String(authHeader).slice(7);
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

  app.delete('/v1/conversations/:id', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const now = new Date().toISOString();
    db.prepare('UPDATE conversations SET deleted_at = ? WHERE id = ?').run(now, id);
    return { success: true, id };
  });

  app.patch('/v1/conversations/:id', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const { title } = req.body || {};
    if (title && typeof title === 'string') {
      const now = new Date().toISOString();
      db.prepare('UPDATE conversations SET title = ?, updated_at = ? WHERE id = ?').run(title.trim(), now, id);
    }
    return { success: true, id };
  });

  app.get('/v1/conversations/:id/messages', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { id } = req.params;
    const messages = db.prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC').all(id);
    const resultStmt = db.prepare('SELECT payload_json FROM query_results WHERE run_id = ?');
    return {
      items: messages.map((m: any) => {
        const parts = JSON.parse(m.parts_json);
        const ticketsPart = Array.isArray(parts) ? parts.find((p: any) => p?.type === 'tickets') : null;
        let tickets = ticketsPart?.tickets;
        if ((!tickets || !tickets.length) && m.role === 'assistant' && m.run_id) {
          const row = resultStmt.get(m.run_id) as any;
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

    // 确保会话存在 (客户端可能直接使用 default 等隐式会话 ID)
    db.prepare(`
      INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(conversationId, '新的查询与会话', now, now);

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

        // 读取本会话最近 20 条已完成消息，倒序取出后再正序传给模型
        const pastRows = db.prepare(`
          SELECT role, parts_json FROM messages
          WHERE conversation_id = ? AND run_id <> ? AND status = 'completed'
          ORDER BY created_at DESC LIMIT 20
        `).all(conversationId, runId) as any[];
        pastRows.reverse();

        const history: Array<{ role: 'user' | 'assistant'; text: string }> = [];
        for (const row of pastRows) {
          try {
            const parts = JSON.parse(row.parts_json);
            const t = parts.find((p: any) => p.type === 'text')?.text || '';
            if (t) {
              history.push({ role: row.role as 'user' | 'assistant', text: t });
            }
          } catch {}
        }

        let lastTickets: any[] = [];
        await agentRuntime.executeRun(
          {
            runId,
            userMessage: input.text || '查票',
            currentDate: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),
            history
          },
          (event: any) => {
            db.prepare(`
              INSERT INTO run_events (run_id, seq, type, payload_json, created_at)
              VALUES (?, ?, ?, ?, ?)
            `).run(runId, event.seq, event.type, JSON.stringify(event.payload), event.occurredAt);
            publishRunEvent(runId, event);

            if (event.type === 'result.ready') {
              const result = event.payload.result;
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
              const parts: any[] = [{ type: 'text', text: event.payload.fullText }];
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

  // 5. SSE 事件流 (可恢复)。format=json 供 WebView/代理缓冲时轮询增量。
  app.get('/v1/runs/:id/events', async (req: any, reply) => {
    if (!authenticate(req, reply, { allowQueryToken: true })) return;
    const { id: runId } = req.params;
    const after = parseInt(req.query.after || '0', 10);
    const format = String(req.query.format || '');

    if (format === 'json') {
      const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as any;
      const rows = db.prepare(
        'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
      ).all(runId, after) as any[];
      const items = rows.map(mapEventRow);
      return {
        status: run?.status || 'unknown',
        lastSeq: items.length ? items[items.length - 1].seq : after,
        items
      };
    }

    // Fastify 5 必须 hijack，否则 async handler 返回后会自动 reply.send() 并关掉 SSE
    reply.hijack();
    const raw = reply.raw;
    try {
      raw.socket?.setNoDelay?.(true);
    } catch {}

    const origin = req.headers.origin;
    raw.statusCode = 200;
    raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    raw.setHeader('Cache-Control', 'no-cache, no-transform');
    raw.setHeader('Connection', 'keep-alive');
    raw.setHeader('X-Accel-Buffering', 'no');
    if (origin) {
      raw.setHeader('Access-Control-Allow-Origin', origin);
      raw.setHeader('Access-Control-Allow-Credentials', 'true');
      raw.setHeader('Vary', 'Origin');
    }
    if (typeof (raw as any).flushHeaders === 'function') {
      (raw as any).flushHeaders();
    }

    const seen = new Set<number>();
    let currentSeq = after;
    const sendEvent = (event: any) => {
      const seq = Number(event?.seq);
      if (Number.isFinite(seq)) {
        if (seen.has(seq)) return;
        seen.add(seq);
        if (seq > currentSeq) currentSeq = seq;
      }
      try {
        raw.write(`id: ${event.seq}\n`);
        raw.write(`event: ${event.type}\n`);
        raw.write(`data: ${JSON.stringify(event)}\n\n`);
        if (typeof (raw as any).flush === 'function') {
          (raw as any).flush();
        }
      } catch {}
    };

    // 心跳 + 2KB 填充，避免 Cloudflare/nginx 把首包缓冲到结束
    raw.write(': ping\n\n');
    raw.write(`: ${' '.repeat(2048)}\n\n`);

    await new Promise<void>((resolve) => {
      let finished = false;
      let heartbeat: ReturnType<typeof setInterval> | undefined;
      let poll: ReturnType<typeof setInterval> | undefined;
      let unsub = () => {};
      const finish = () => {
        if (finished) return;
        finished = true;
        unsub();
        if (heartbeat) clearInterval(heartbeat);
        if (poll) clearInterval(poll);
        try {
          raw.end();
        } catch {}
        resolve();
      };

      const pushRow = (row: any) => sendEvent(mapEventRow(row));

      unsub = subscribeRunEvents(runId, (event: any) => {
        sendEvent(event);
        if (event?.type === 'run.completed' || event?.type === 'run.failed') {
          finish();
        }
      });

      const pastEvents = db.prepare(
        'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
      ).all(runId, after) as any[];
      for (const row of pastEvents) {
        pushRow(row);
      }

      const existing = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as any;
      if (existing && (existing.status === 'succeeded' || existing.status === 'failed' || existing.status === 'cancelled')) {
        finish();
        return;
      }

      heartbeat = setInterval(() => {
        try {
          raw.write(': ka\n\n');
        } catch {
          finish();
        }
      }, 15000);

      poll = setInterval(() => {
        const newEvents = db.prepare(
          'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
        ).all(runId, currentSeq) as any[];
        for (const row of newEvents) {
          pushRow(row);
        }
        const run = db.prepare('SELECT status FROM runs WHERE id = ?').get(runId) as any;
        if (run && (run.status === 'succeeded' || run.status === 'failed' || run.status === 'cancelled')) {
          const latest = db.prepare(
            'SELECT * FROM run_events WHERE run_id = ? AND seq > ? ORDER BY seq ASC'
          ).all(runId, currentSeq) as any[];
          for (const row of latest) {
            pushRow(row);
          }
          finish();
        }
      }, 400);

      req.raw.on('close', finish);
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

  // 7. 模型配置与中转站模型拉取
  app.get('/v1/settings/model', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const row = db.prepare('SELECT * FROM model_profiles WHERE id = ?').get('default') as any;
    if (!row) {
      return {
        id: 'default',
        baseUrl: process.env.RELAY_BASE_URL || 'https://api.openai.com/v1',
        api: process.env.RELAY_API || 'openai-completions',
        modelId: process.env.RELAY_MODEL_ID || 'gpt-4o-mini',
        hasKey: Boolean(process.env.RELAY_API_KEY || process.env.RELAY_API_KEY_FILE),
        enabled: true
      };
    }
    return {
      id: row.id,
      baseUrl: row.base_url,
      api: row.api,
      modelId: row.model_id,
      hasKey: Boolean(row.secret_ciphertext),
      enabled: Boolean(row.enabled)
    };
  });

  app.put('/v1/settings/model', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;
    const { baseUrl, api, modelId, apiKey } = req.body || {};
    if (!baseUrl || !modelId) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: '缺少必须的模型参数' } });
    }

    const existing = db.prepare('SELECT * FROM model_profiles WHERE id = ?').get('default') as any;
    let secret = existing ? existing.secret_ciphertext : '';
    if (apiKey && apiKey.trim()) {
      // 简单安全混淆存储或在生产通过独立主密钥加密
      secret = Buffer.from(apiKey.trim()).toString('base64');
    }

    db.prepare(`
      INSERT OR REPLACE INTO model_profiles (id, base_url, api, model_id, secret_ciphertext, enabled)
      VALUES ('default', ?, ?, ?, ?, 1)
    `).run(baseUrl, api || 'openai-completions', modelId, secret);

    return { success: true, modelId };
  });

  // 从中转站动态获取其所有可用模型列表 (/v1/models)
  app.get('/v1/models/available', async (req: any, reply) => {
    if (!authenticate(req, reply)) return;

    const row = db.prepare('SELECT * FROM model_profiles WHERE id = ?').get('default') as any;
    const baseUrl = row ? row.base_url : (process.env.RELAY_BASE_URL || 'https://api.openai.com/v1');
    let apiKey = '';
    if (row && row.secret_ciphertext) {
      apiKey = Buffer.from(row.secret_ciphertext, 'base64').toString('utf-8');
    } else {
      apiKey = process.env.RELAY_API_KEY || '';
    }

    try {
      const targetUrl = baseUrl.replace(/\/+$/, '') + '/models';
      const fetchRes = await fetch(targetUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      });

      if (!fetchRes.ok) {
        throw new Error(`上游返回 HTTP ${fetchRes.status}`);
      }

      const data = await fetchRes.json() as any;
      let models: string[] = [];
      if (Array.isArray(data)) {
        models = data.map((m: any) => m.id || m.name || String(m));
      } else if (data && Array.isArray(data.data)) {
        models = data.data.map((m: any) => m.id || m.name || String(m));
      }

      return { items: models.filter(Boolean) };
    } catch (err: any) {
      // 容错返回通用主流列表供选择
      return {
        items: [
          'gpt-4o',
          'gpt-4o-mini',
          'claude-3-5-sonnet',
          'claude-3-5-haiku',
          'deepseek-chat',
          'deepseek-reasoner',
          'qwen-plus',
          'qwen-max'
        ],
        fallback: true,
        message: err?.message || '无法直接拉取上游模型列表'
      };
    }
  });

  return { app, db };
}
