import crypto from 'node:crypto';
import type Database from 'better-sqlite3';
import { WebSocket, WebSocketServer } from 'ws';
import {
  CreatePiTaskSchema,
  PiCommandRequestSchema,
  PiRunnerHelloSchema,
  PiRunnerInboundSchema,
  type PiRunnerCommand
} from '@assistant/contracts';

type Identity = { userId: string; tenantId: string };
type Listener = (event: Record<string, unknown>) => void;
const terminal = new Set(['succeeded', 'failed', 'cancelled', 'interrupted']);
const json = (value: unknown) => JSON.stringify(value ?? {});
const sha256 = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const uuid = () => crypto.randomUUID();

export function registerPi(app: any, db: Database.Database) {
  const sockets = new Map<string, WebSocket>();
  const listeners = new Map<string, Set<Listener>>();
  const internalToken = () => process.env.PI_INTERNAL_TOKEN || '';
  const pairAttempts = new Map<string, { count: number; resetAt: number }>();

  const identity = (req: any, reply: any): Identity | null => {
    const expected = internalToken();
    const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
    const userId = String(req.headers['x-pi-user-id'] || '');
    const tenantId = String(req.headers['x-pi-tenant-id'] || 'default');
    if (!expected) {
      reply.status(503).send({ error: { code: 'CONFIG_MISSING', message: 'PI_INTERNAL_TOKEN 未配置' } });
      return null;
    }
    if (!bearer || !crypto.timingSafeEqual(Buffer.from(sha256(bearer)), Buffer.from(sha256(expected)))) {
      reply.status(401).send({ error: { code: 'AUTH_REQUIRED', message: '内部服务凭证无效' } });
      return null;
    }
    if (!userId) {
      reply.status(401).send({ error: { code: 'AUTH_REQUIRED', message: '缺少服务端用户身份' } });
      return null;
    }
    return { userId, tenantId };
  };

  const ownedTask = (taskId: string, who: Identity) => db.prepare(`
    SELECT t.*, p.host_id, p.runner_project_key, p.name AS project_name, h.name AS host_name
    FROM pi_tasks t JOIN pi_projects p ON p.id=t.project_id JOIN pi_hosts h ON h.id=p.host_id
    WHERE t.id=? AND h.owner_user_id=? AND h.tenant_id=? AND h.revoked_at IS NULL
  `).get(taskId, who.userId, who.tenantId) as any;

  const publish = (runId: string, event: Record<string, unknown>) => {
    for (const listener of listeners.get(runId) || []) listener(event);
  };

  const continuousEventSeq = (runId: string) => {
    let continuous = 0;
    for (const row of db.prepare('SELECT seq FROM pi_events WHERE run_id=? ORDER BY seq').all(runId) as Array<{ seq: number }>) {
      if (row.seq !== continuous + 1) break;
      continuous = row.seq;
    }
    return continuous;
  };

  const send = (hostId: string, message: PiRunnerCommand | Record<string, unknown>) => {
    const socket = sockets.get(hostId);
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  };

  app.post('/internal/pi/pairing-codes', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const code = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    db.prepare('INSERT INTO pi_pairing_codes (code_hash,owner_user_id,tenant_id,expires_at) VALUES (?,?,?,?)')
      .run(sha256(code), who.userId, who.tenantId, expiresAt);
    return { code, expiresAt };
  });

  app.post('/runner/v1/pair', async (req: any, reply: any) => {
    const key = String(req.ip || 'unknown');
    const attempt = pairAttempts.get(key);
    if (attempt && attempt.resetAt > Date.now() && attempt.count >= 10) return reply.status(429).send({ error: { code: 'RATE_LIMITED', message: '配对尝试过多' } });
    pairAttempts.set(key, { count: attempt?.resetAt && attempt.resetAt > Date.now() ? attempt.count + 1 : 1, resetAt: attempt?.resetAt && attempt.resetAt > Date.now() ? attempt.resetAt : Date.now() + 60_000 });
    const { pairingCode, name, platform } = req.body || {};
    if (!/^\d{6}$/.test(String(pairingCode)) || !['darwin', 'linux'].includes(platform) || !String(name || '').trim()) {
      return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: '配对参数无效' } });
    }
    const codeHash = sha256(String(pairingCode));
    const now = new Date().toISOString();
    const row = db.transaction(() => {
      const found = db.prepare('SELECT * FROM pi_pairing_codes WHERE code_hash=? AND consumed_at IS NULL AND expires_at>?').get(codeHash, now) as any;
      if (!found) return null;
      const changed = db.prepare('UPDATE pi_pairing_codes SET consumed_at=? WHERE code_hash=? AND consumed_at IS NULL').run(now, codeHash);
      return changed.changes === 1 ? found : null;
    })();
    if (!row) return reply.status(401).send({ error: { code: 'AUTH_REQUIRED', message: '配对码无效或已使用' } });
    const hostId = uuid();
    const credential = `pir_${crypto.randomBytes(32).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + 90 * 24 * 3600_000).toISOString();
    db.prepare(`INSERT INTO pi_hosts (id,owner_user_id,tenant_id,name,platform,credential_hash,expires_at)
      VALUES (?,?,?,?,?,?,?)`).run(hostId, row.owner_user_id, row.tenant_id, String(name).trim(), platform, sha256(credential), expiresAt);
    return { hostId, credential, expiresAt, protocolVersion: 1 };
  });

  app.get('/internal/pi/hosts', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const items = db.prepare('SELECT id,name,platform,pi_version,last_seen_at,expires_at FROM pi_hosts WHERE owner_user_id=? AND tenant_id=? AND revoked_at IS NULL ORDER BY name')
      .all(who.userId, who.tenantId) as any[];
    return { items: items.map((host) => ({ ...host, online: sockets.get(host.id)?.readyState === WebSocket.OPEN })) };
  });

  app.post('/internal/pi/hosts/:id/revoke', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const result = db.prepare('UPDATE pi_hosts SET revoked_at=?,credential_version=credential_version+1 WHERE id=? AND owner_user_id=? AND tenant_id=? AND revoked_at IS NULL')
      .run(new Date().toISOString(), req.params.id, who.userId, who.tenantId);
    if (!result.changes) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '机器不存在' } });
    sockets.get(req.params.id)?.close(4001, 'revoked');
    return { success: true };
  });

  app.get('/internal/pi/hosts/:id/projects', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const host = db.prepare('SELECT id FROM pi_hosts WHERE id=? AND owner_user_id=? AND tenant_id=? AND revoked_at IS NULL').get(req.params.id, who.userId, who.tenantId);
    if (!host) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '机器不存在' } });
    return { items: db.prepare('SELECT id,name,display_path FROM pi_projects WHERE host_id=? AND enabled=1 ORDER BY name').all(req.params.id) };
  });

  app.get('/internal/pi/projects/:id/models', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const row = db.prepare(`SELECT h.id,h.models_json FROM pi_projects p JOIN pi_hosts h ON h.id=p.host_id
      WHERE p.id=? AND h.owner_user_id=? AND h.tenant_id=? AND h.revoked_at IS NULL`).get(req.params.id, who.userId, who.tenantId) as any;
    if (!row) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '项目不存在' } });
    return { items: JSON.parse(row.models_json), cached: sockets.get(row.id)?.readyState !== WebSocket.OPEN };
  });

  app.get('/internal/pi/projects/:id/sessions', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const row = db.prepare(`SELECT p.runner_project_key,h.sessions_json FROM pi_projects p JOIN pi_hosts h ON h.id=p.host_id
      WHERE p.id=? AND h.owner_user_id=? AND h.tenant_id=? AND h.revoked_at IS NULL`).get(req.params.id, who.userId, who.tenantId) as any;
    if (!row) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '项目不存在' } });
    return { items: (JSON.parse(row.sessions_json) as any[]).filter((s) => s.projectKey === row.runner_project_key) };
  });

  app.get('/internal/pi/tasks', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
    const cursor = String(req.query.cursor || '9999-12-31T23:59:59.999Z');
    const hostId = String(req.query.hostId || '');
    const rows = db.prepare(`SELECT t.*,p.name AS project_name,h.id AS host_id,h.name AS host_name
      FROM pi_tasks t JOIN pi_projects p ON p.id=t.project_id JOIN pi_hosts h ON h.id=p.host_id
      WHERE h.owner_user_id=? AND h.tenant_id=? AND t.archived_at IS NULL AND t.updated_at<? AND (?='' OR h.id=?)
      ORDER BY t.updated_at DESC LIMIT ?`).all(who.userId, who.tenantId, cursor, hostId, hostId, limit) as any[];
    return { items: rows.map((r) => ({ ...r, online: sockets.get(r.host_id)?.readyState === WebSocket.OPEN })), nextCursor: rows.length === limit ? rows.at(-1).updated_at : null };
  });

  app.post('/internal/pi/tasks', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const parsed = CreatePiTaskSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: '任务参数无效' } });
    const body = parsed.data;
    const requestHash = sha256(json(body));
    const prior = db.prepare('SELECT request_hash,response_json FROM pi_commands WHERE tenant_id=? AND owner_user_id=? AND client_request_id=?')
      .get(who.tenantId, who.userId, body.clientRequestId) as any;
    if (prior) return prior.request_hash === requestHash ? JSON.parse(prior.response_json) : reply.status(409).send({ error: { code: 'IDEMPOTENCY_CONFLICT', message: '幂等键已用于其他请求' } });
    const project = db.prepare(`SELECT p.*,h.owner_user_id,h.tenant_id FROM pi_projects p JOIN pi_hosts h ON h.id=p.host_id
      WHERE p.id=? AND p.enabled=1 AND h.owner_user_id=? AND h.tenant_id=? AND h.revoked_at IS NULL`).get(body.projectId, who.userId, who.tenantId) as any;
    if (!project) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '项目不存在' } });
    if (body.sessionRef) {
      const existing = db.prepare('SELECT * FROM pi_tasks WHERE project_id=? AND session_ref=? AND archived_at IS NULL').get(body.projectId, body.sessionRef) as any;
      if (existing) {
        db.prepare(`INSERT INTO pi_commands (id,owner_user_id,tenant_id,client_request_id,request_hash,task_id,kind,payload_json,status,response_json,created_at)
          VALUES (?,?,?,?,?,?, 'create_task',?,'accepted',?,?)`).run(uuid(), who.userId, who.tenantId, body.clientRequestId, requestHash, existing.id, json(body), json(existing), new Date().toISOString());
        return existing;
      }
    }
    const task = { id: uuid(), projectId: body.projectId, title: body.title, sessionRef: body.sessionRef || null };
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare('INSERT INTO pi_tasks (id,project_id,title,session_ref,created_at,updated_at) VALUES (?,?,?,?,?,?)')
        .run(task.id, task.projectId, task.title, task.sessionRef, now, now);
      db.prepare(`INSERT INTO pi_commands (id,owner_user_id,tenant_id,client_request_id,request_hash,task_id,kind,payload_json,status,response_json,created_at)
        VALUES (?,?,?,?,?,?, 'create_task',?,'accepted',?,?)`).run(uuid(), who.userId, who.tenantId, body.clientRequestId, requestHash, task.id, json(body), json(task), now);
    })();
    return reply.status(201).send(task);
  });

  app.get('/internal/pi/tasks/:id', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const task = ownedTask(req.params.id, who);
    if (!task) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    const runs = db.prepare('SELECT * FROM pi_runs WHERE task_id=? ORDER BY created_at DESC').all(task.id);
    return { ...task, online: sockets.get(task.host_id)?.readyState === WebSocket.OPEN, runs };
  });

  app.get('/internal/pi/tasks/:id/messages', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const task = ownedTask(req.params.id, who);
    if (!task) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    const after = Number(req.query.cursor) || 0;
    const limit = Math.min(Number(req.query.limit) || 100, 200);
    const items = db.prepare(`SELECT e.rowid AS cursor,e.run_id,e.seq,e.type,e.payload_json,e.occurred_at FROM pi_events e JOIN pi_runs r ON r.id=e.run_id
      WHERE r.task_id=? AND e.rowid>? AND e.type IN ('message.delta','message.completed','input.required') ORDER BY e.rowid LIMIT ?`)
      .all(task.id, after, limit) as any[];
    return { items: items.map((e) => ({ ...e, payload: JSON.parse(e.payload_json) })), nextCursor: items.at(-1)?.cursor || null, updatedAt: task.updated_at };
  });

  app.post('/internal/pi/tasks/:id/commands', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const task = ownedTask(req.params.id, who);
    if (!task) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    const parsed = PiCommandRequestSchema.safeParse(req.body);
    if (!parsed.success) return reply.status(400).send({ error: { code: 'INVALID_QUERY', message: '命令参数无效' } });
    const body = parsed.data as any;
    const requestHash = sha256(json(body));
    const prior = db.prepare('SELECT * FROM pi_commands WHERE tenant_id=? AND owner_user_id=? AND client_request_id=?').get(who.tenantId, who.userId, body.clientRequestId) as any;
    if (prior) return prior.request_hash === requestHash ? JSON.parse(prior.response_json || '{}') : reply.status(409).send({ error: { code: 'IDEMPOTENCY_CONFLICT', message: '幂等键已用于其他请求' } });
    if (!send(task.host_id, { type: 'ping' })) return reply.status(503).send({ error: { code: 'HOST_OFFLINE', message: '机器离线' } });
    const active = db.prepare("SELECT * FROM pi_runs WHERE task_id=? AND status IN ('queued','running','cancelling') ORDER BY CASE status WHEN 'running' THEN 0 WHEN 'cancelling' THEN 1 ELSE 2 END,created_at LIMIT 1").get(task.id) as any;
    if (['steer', 'stop', 'input_response'].includes(body.kind) && (!active || active.id !== body.runId)) {
      return reply.status(409).send({ error: { code: 'RUN_CONFLICT', message: '目标 run 已变化' } });
    }
    if (body.kind === 'set_model' && active) return reply.status(409).send({ error: { code: 'RUN_CONFLICT', message: '运行期间不能切换模型' } });
    if (body.kind === 'prompt') {
      const busy = db.prepare(`SELECT r.id FROM pi_runs r JOIN pi_tasks t ON t.id=r.task_id
        WHERE t.project_id=? AND r.status IN ('queued','running','cancelling') LIMIT 1`).get(task.project_id);
      if (busy) return reply.status(409).send({ error: { code: 'RUN_CONFLICT', message: '项目正在执行其他任务' } });
    }
    const runId = ['prompt', 'follow_up'].includes(body.kind) ? uuid() : (body.runId || null);
    const commandId = uuid();
    const now = new Date().toISOString();
    const response = { commandId, runId, status: 'received' };
    db.transaction(() => {
      if (body.kind === 'prompt' || body.kind === 'follow_up') db.prepare("INSERT INTO pi_runs (id,task_id,status,created_at) VALUES (?,?,'queued',?)").run(runId, task.id, now);
      if (body.kind === 'stop') db.prepare("UPDATE pi_runs SET status='cancelling' WHERE id=?").run(runId);
      db.prepare(`INSERT INTO pi_commands (id,owner_user_id,tenant_id,client_request_id,request_hash,task_id,run_id,kind,payload_json,status,response_json,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,'received',?,?)`).run(commandId, who.userId, who.tenantId, body.clientRequestId, requestHash, task.id, runId, body.kind, json(body.payload), json(response), now);
      db.prepare('UPDATE pi_tasks SET updated_at=? WHERE id=?').run(now, task.id);
    })();
    const message: PiRunnerCommand = { type: 'command', commandId, taskId: task.id, runId, projectKey: task.runner_project_key, sessionRef: task.session_ref, kind: body.kind, payload: body.payload, requestHash };
    send(task.host_id, message);
    return reply.status(202).send(response);
  });

  app.get('/internal/pi/commands/:id', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const row = db.prepare('SELECT id,run_id,kind,status,response_json,created_at FROM pi_commands WHERE id=? AND owner_user_id=? AND tenant_id=?').get(req.params.id, who.userId, who.tenantId) as any;
    if (!row) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '命令不存在' } });
    return { ...row, response: row.response_json ? JSON.parse(row.response_json) : null };
  });

  app.get('/internal/pi/commands', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const row = db.prepare('SELECT id,run_id,kind,status,response_json,created_at FROM pi_commands WHERE client_request_id=? AND owner_user_id=? AND tenant_id=?').get(req.query.clientRequestId, who.userId, who.tenantId) as any;
    if (!row) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '命令不存在' } });
    return { ...row, response: row.response_json ? JSON.parse(row.response_json) : null };
  });

  app.get('/internal/pi/runs/:id/events', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const run = db.prepare(`SELECT r.* FROM pi_runs r JOIN pi_tasks t ON t.id=r.task_id JOIN pi_projects p ON p.id=t.project_id JOIN pi_hosts h ON h.id=p.host_id
      WHERE r.id=? AND h.owner_user_id=? AND h.tenant_id=?`).get(req.params.id, who.userId, who.tenantId) as any;
    if (!run) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'run 不存在' } });
    const after = Number(req.query.after) || 0;
    const read = (cursor = after) => (db.prepare('SELECT * FROM pi_events WHERE run_id=? AND seq>? ORDER BY seq LIMIT 500').all(run.id, cursor) as any[])
      .map((e) => ({ runId: e.run_id, seq: e.seq, type: e.type, occurredAt: e.occurred_at, payload: JSON.parse(e.payload_json) }));
    if (req.query.format === 'json') return { status: run.status, items: read() };
    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' });
    const seen = new Set<number>();
    const emit = (event: any) => {
      if (seen.has(event.seq)) return;
      seen.add(event.seq);
      raw.write(`id: ${event.seq}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
    };
    const set = listeners.get(run.id) || new Set<Listener>();
    const listener = (event: any) => { emit(event); if (['run.completed','run.failed','run.cancelled','run.interrupted'].includes(event.type)) cleanup(); };
    const heartbeat = setInterval(() => raw.write(': ka\n\n'), 15_000);
    const cleanup = () => { clearInterval(heartbeat); set.delete(listener); if (!set.size) listeners.delete(run.id); try { raw.end(); } catch {} };
    set.add(listener); listeners.set(run.id, set); req.raw.on('close', cleanup);
    let cursor = after;
    for (;;) {
      const page = read(cursor);
      for (const event of page) emit(event);
      if (page.length < 500) break;
      cursor = page.at(-1)!.seq;
    }
    const current = db.prepare('SELECT status FROM pi_runs WHERE id=?').get(run.id) as any;
    if (terminal.has(current?.status || run.status)) cleanup();
  });

  app.get('/internal/pi/runs/:id/outputs/:outputId', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const owned = db.prepare(`SELECT r.id FROM pi_runs r JOIN pi_tasks t ON t.id=r.task_id JOIN pi_projects p ON p.id=t.project_id JOIN pi_hosts h ON h.id=p.host_id
      WHERE r.id=? AND h.owner_user_id=? AND h.tenant_id=?`).get(req.params.id, who.userId, who.tenantId);
    if (!owned) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '输出不存在' } });
    const cursor = Number(req.query.cursor) || 0; const limit = Math.min(Number(req.query.limit) || 100, 500);
    const rows = db.prepare("SELECT seq,payload_json FROM pi_events WHERE run_id=? AND type='output.chunk' AND seq>? ORDER BY seq LIMIT ?").all(req.params.id, cursor, limit) as any[];
    const items = rows.map((r) => ({ seq: r.seq, ...JSON.parse(r.payload_json) })).filter((r) => r.outputId === req.params.outputId);
    return { items, nextCursor: rows.at(-1)?.seq || null };
  });

  app.post('/internal/pi/tasks/:id/archive', async (req: any, reply: any) => {
    const who = identity(req, reply); if (!who) return;
    const task = ownedTask(req.params.id, who);
    if (!task) return reply.status(404).send({ error: { code: 'NOT_FOUND', message: '任务不存在' } });
    const active = db.prepare("SELECT id FROM pi_runs WHERE task_id=? AND status IN ('queued','running','cancelling')").get(task.id);
    if (active) return reply.status(409).send({ error: { code: 'RUN_CONFLICT', message: '执行中不能归档' } });
    db.prepare('UPDATE pi_tasks SET archived_at=?,updated_at=? WHERE id=?').run(new Date().toISOString(), new Date().toISOString(), task.id);
    return { success: true };
  });

  const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
  app.server.on('upgrade', (request: any, socket: any, head: any) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (url.pathname !== '/runner/v1/connect' || String(request.headers.upgrade || '').toLowerCase() !== 'websocket') {
      socket.end('HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');
      return;
    }
    const credential = String(request.headers.authorization || '').replace(/^Bearer /, '');
    const host = credential && db.prepare('SELECT * FROM pi_hosts WHERE credential_hash=? AND revoked_at IS NULL AND expires_at>?').get(sha256(credential), new Date().toISOString()) as any;
    if (!host) { socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n'); return socket.destroy(); }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, host));
  });

  wss.on('connection', (ws: WebSocket, host: any) => {
    sockets.get(host.id)?.close(4000, 'replaced'); sockets.set(host.id, ws);
    let hello = false;
    let lastActivity = Date.now();
    ws.on('message', (raw) => {
      lastActivity = Date.now();
      let value: unknown; try { value = JSON.parse(raw.toString()); } catch { return ws.close(1007, 'invalid json'); }
      if (!hello) {
        const parsed = PiRunnerHelloSchema.safeParse(value);
        if (!parsed.success) return ws.close(1002, 'hello required');
        hello = true; const h = parsed.data; const now = new Date().toISOString();
        db.transaction(() => {
          db.prepare('UPDATE pi_hosts SET platform=?,pi_version=?,capabilities_json=?,models_json=?,sessions_json=?,last_seen_at=? WHERE id=?').run(h.platform, h.piVersion, json(h.capabilities), json(h.models), json(h.sessions), now, host.id);
          for (const project of h.projects) db.prepare(`INSERT INTO pi_projects (id,host_id,runner_project_key,name,display_path) VALUES (?,?,?,?,?)
            ON CONFLICT(host_id,runner_project_key) DO UPDATE SET name=excluded.name,display_path=excluded.display_path,enabled=1`)
            .run(uuid(), host.id, project.key, project.name, project.displayPath);
        })();
        const runIds = db.prepare(`SELECT r.id FROM pi_runs r JOIN pi_tasks t ON t.id=r.task_id
          JOIN pi_projects p ON p.id=t.project_id WHERE p.host_id=?`).all(host.id) as Array<{ id: string }>;
        ws.send(json({ type: 'welcome', connectionId: uuid(), eventCursors: Object.fromEntries(runIds.map((r) => [r.id, continuousEventSeq(r.id)])) }));
        const pending = db.prepare(`SELECT c.*,t.session_ref,p.runner_project_key FROM pi_commands c JOIN pi_tasks t ON t.id=c.task_id
          JOIN pi_projects p ON p.id=t.project_id WHERE p.host_id=? AND c.status IN ('received','acknowledged') ORDER BY c.created_at`).all(host.id) as any[];
        for (const command of pending) ws.send(json({ type: 'command', commandId: command.id, taskId: command.task_id, runId: command.run_id,
          projectKey: command.runner_project_key, sessionRef: command.session_ref, kind: command.kind, payload: JSON.parse(command.payload_json), requestHash: command.request_hash }));
        return;
      }
      const parsed = PiRunnerInboundSchema.safeParse(value); if (!parsed.success) return ws.close(1007, 'invalid message');
      const message: any = parsed.data; db.prepare('UPDATE pi_hosts SET last_seen_at=? WHERE id=?').run(new Date().toISOString(), host.id);
      if (message.type === 'pong') return;
      if (message.type === 'command_ack') return void db.prepare(`UPDATE pi_commands SET status='acknowledged' WHERE id=? AND status='received' AND task_id IN
        (SELECT t.id FROM pi_tasks t JOIN pi_projects p ON p.id=t.project_id WHERE p.host_id=?)`).run(message.commandId, host.id);
      if (message.type === 'command_result') {
        const command = db.prepare(`SELECT c.* FROM pi_commands c JOIN pi_tasks t ON t.id=c.task_id JOIN pi_projects p ON p.id=t.project_id
          WHERE c.id=? AND p.host_id=?`).get(message.commandId, host.id) as any;
        if (!command) return;
        let failedEvent: any = null;
        db.transaction(() => {
          db.prepare('UPDATE pi_commands SET status=?,response_json=? WHERE id=?').run(message.status, json(message.response), command.id);
          if (!['rejected', 'unknown'].includes(message.status) || !['prompt', 'follow_up'].includes(command.kind) || !command.run_id) return;
          const failedAt = new Date().toISOString();
          const runStatus = message.status === 'unknown' ? 'interrupted' : 'failed';
          const reason = message.status === 'unknown' ? 'command_outcome_unknown' : 'command_rejected';
          const allowed = message.status === 'unknown' ? "('queued','running','cancelling')" : "('queued')";
          const changed = db.prepare(`UPDATE pi_runs SET status=?,activity=NULL,finished_at=?,outcome_json=? WHERE id=? AND status IN ${allowed}`)
            .run(runStatus, failedAt, json({ reason, response: message.response }), command.run_id);
          if (!changed.changes) return;
          const seq = Number((db.prepare('SELECT MAX(seq) seq FROM pi_events WHERE run_id=?').get(command.run_id) as any)?.seq || 0) + 1;
          const payload = { reason, response: message.response };
          const eventType = message.status === 'unknown' ? 'run.interrupted' : 'run.failed';
          db.prepare('INSERT INTO pi_events (run_id,seq,type,payload_json,occurred_at) VALUES (?,?,?,?,?)')
            .run(command.run_id, seq, eventType, json(payload), failedAt);
          db.prepare('UPDATE pi_tasks SET updated_at=? WHERE id=?').run(failedAt, command.task_id);
          failedEvent = { runId: command.run_id, seq, type: eventType, occurredAt: failedAt, payload };
        })();
        if (failedEvent) publish(command.run_id, failedEvent);
        return;
      }
      if (message.type === 'event') {
        const ownedRun = db.prepare(`SELECT r.id FROM pi_runs r JOIN pi_tasks t ON t.id=r.task_id JOIN pi_projects p ON p.id=t.project_id WHERE r.id=? AND p.host_id=?`).get(message.runId, host.id);
        if (!ownedRun) return ws.close(1008, 'run ownership mismatch');
        const existing = db.prepare('SELECT type,payload_json FROM pi_events WHERE run_id=? AND seq=?').get(message.runId, message.seq) as any;
        if (existing && (existing.type !== message.eventType || existing.payload_json !== json(message.payload))) return ws.close(1008, 'event conflict');
        if (existing) {
          ws.send(json({ type: 'event_ack', runId: message.runId, seq: continuousEventSeq(message.runId) }));
          return;
        }
        db.transaction(() => {
          db.prepare('INSERT INTO pi_events (run_id,seq,type,payload_json,occurred_at) VALUES (?,?,?,?,?)').run(message.runId, message.seq, message.eventType, json(message.payload), message.occurredAt);
          db.prepare('UPDATE pi_tasks SET updated_at=? WHERE id=(SELECT task_id FROM pi_runs WHERE id=?)').run(message.occurredAt, message.runId);
          const status = message.eventType === 'run.completed' ? 'succeeded' : message.eventType === 'run.failed' ? 'failed' : message.eventType === 'run.cancelled' ? 'cancelled' : message.eventType === 'run.interrupted' ? 'interrupted' : null;
          if (message.eventType === 'run.started') db.prepare("UPDATE pi_runs SET status='running',started_at=? WHERE id=? AND status='queued'").run(message.occurredAt, message.runId);
          const activity = message.eventType === 'tool.started' ? 'tool_running' : message.eventType === 'input.required' ? 'waiting_input' : ['run.started','message.delta','message.completed','tool.completed'].includes(message.eventType) ? 'generating' : null;
          if (activity) db.prepare("UPDATE pi_runs SET activity=? WHERE id=? AND status IN ('queued','running','cancelling')").run(activity, message.runId);
          if (message.eventType === 'session.updated' && message.payload.sessionRef) db.prepare('UPDATE pi_tasks SET session_ref=?,updated_at=? WHERE id=(SELECT task_id FROM pi_runs WHERE id=?)').run(message.payload.sessionRef, message.occurredAt, message.runId);
          if (message.eventType === 'messages.snapshot') db.prepare('UPDATE pi_tasks SET messages_snapshot_json=?,snapshot_cursors_json=?,updated_at=? WHERE id=(SELECT task_id FROM pi_runs WHERE id=?)')
            .run(json(message.payload.messages), json({ [message.runId]: message.seq }), message.occurredAt, message.runId);
          if (status) db.prepare("UPDATE pi_runs SET status=?,activity=NULL,finished_at=?,outcome_json=? WHERE id=? AND status IN ('queued','running','cancelling')")
            .run(status, message.occurredAt, json(message.payload), message.runId);
        })();
        const event = { runId: message.runId, seq: message.seq, type: message.eventType, occurredAt: message.occurredAt, payload: message.payload };
        publish(message.runId, event);
        // ponytail: linear continuity scan; replace with a stored cursor only if event volume makes this measurable.
        ws.send(json({ type: 'event_ack', runId: message.runId, seq: continuousEventSeq(message.runId) }));
      }
    });
    const ping = setInterval(() => {
      if (Date.now() - lastActivity > 45_000) return ws.terminate();
      if (ws.readyState === WebSocket.OPEN) ws.send(json({ type: 'ping', at: new Date().toISOString() }));
    }, 15_000);
    ws.on('close', () => { clearInterval(ping); if (sockets.get(host.id) === ws) sockets.delete(host.id); });
  });

  app.addHook('onClose', async () => { for (const ws of sockets.values()) ws.close(); wss.close(); });
}
