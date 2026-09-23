import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Database from 'better-sqlite3';
import WebSocket from 'ws';
import { PiRunnerCommandSchema, PiRunnerHelloSchema, type PiRunnerCommand } from '@assistant/contracts';

type Project = { key: string; name: string; path: string };
type Config = { gatewayUrl: string; hostId: string; credential: string; piExecutable: string; projects: Project[]; models?: Array<{ provider: string; modelId: string; name?: string }> };
type Managed = { child: ChildProcessWithoutNullStreams; taskId: string; project: Project; runId: string | null; sessionRef: string | null; sessionPath: string | null; aborted: boolean; started: boolean; failure: string | null; modelFailure: string | null; buffer: string; requests: Map<string, string> };

const stateDir = path.resolve(process.env.PI_RUNNER_STATE_DIR || path.join(os.homedir(), '.pi-remote-runner'));
const configPath = path.join(stateDir, 'config.json');
const dbPath = path.join(stateDir, 'runner.sqlite');
const lockPath = path.join(stateDir, 'runner.lock');
const instanceId = crypto.randomUUID();
const now = () => new Date().toISOString();
export function consumeJsonLines(state: { buffer: string }, chunk: string, onLine: (value: unknown) => void) {
  state.buffer += chunk;
  for (;;) {
    const lf = state.buffer.indexOf('\n');
    if (lf < 0) return;
    let line = state.buffer.slice(0, lf); state.buffer = state.buffer.slice(lf + 1);
    if (line.endsWith('\r')) line = line.slice(0, -1);
    if (line) onLine(JSON.parse(line));
  }
}

function ensureStateDir() {
  fs.mkdirSync(stateDir, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(stateDir, 0o700); } catch {}
}

function acquireInstanceLock() {
  ensureStateDir();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, 'wx', 0o600);
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, instanceId, processStartedAt: processIdentity(process.pid) })); fs.closeSync(fd);
      process.once('exit', () => { try { if (JSON.parse(fs.readFileSync(lockPath, 'utf8')).instanceId === instanceId) fs.unlinkSync(lockPath); } catch {} });
      return;
    } catch (error: any) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const pid = Number(lock.pid);
        if (pid !== process.pid && (!lock.processStartedAt || processIdentity(pid) === lock.processStartedAt)) {
          process.kill(pid, 0);
          throw new Error(`已有 Pi Runner 正在运行（PID ${pid}）`);
        }
      } catch (lockError: any) {
        if (lockError?.message?.startsWith('已有 Pi Runner')) throw lockError;
      }
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }
  throw new Error('无法取得 Pi Runner 单实例锁');
}

function processIdentity(pid: number) {
  if (process.platform === 'linux') {
    try {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8');
      const start = stat.slice(stat.lastIndexOf(')') + 2).split(' ')[19];
      return `linux:${fs.readFileSync('/proc/sys/kernel/random/boot_id', 'utf8').trim()}:${start}`;
    } catch { return null; }
  }
  const result = spawnSync('ps', ['-o', 'lstart=', '-p', String(pid)], { encoding: 'utf8', shell: false });
  const started = result.status === 0 ? result.stdout.trim().replace(/\s+/g, ' ') : '';
  return started ? `${process.platform}:${started}` : null;
}

const waitForProcessChange = (pid: number, identity: string, timeoutMs: number) => {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (processIdentity(pid) !== identity) return true;
    Atomics.wait(sleeper, 0, 0, 50);
  }
  return processIdentity(pid) !== identity;
};

function loadConfig(): Config {
  const value = JSON.parse(fs.readFileSync(configPath, 'utf8')) as Config;
  if (!value.gatewayUrl || !value.credential || !value.piExecutable || !Array.isArray(value.projects)) throw new Error('Runner 配置不完整');
  value.projects = value.projects.map((project) => ({ ...project, path: fs.realpathSync(project.path) }));
  return value;
}

function projectLockKey(projectPath: string) {
  const dotGit = path.join(projectPath, '.git');
  try {
    let gitDir = dotGit;
    if (fs.statSync(dotGit).isFile()) {
      const pointer = fs.readFileSync(dotGit, 'utf8').match(/^gitdir:\s*(.+)$/m)?.[1];
      if (!pointer) return projectPath;
      gitDir = path.resolve(projectPath, pointer);
    }
    const common = path.join(gitDir, 'commondir');
    return fs.existsSync(common) ? fs.realpathSync(path.resolve(gitDir, fs.readFileSync(common, 'utf8').trim())) : fs.realpathSync(gitDir);
  } catch { return projectPath; }
}

function openDb() {
  ensureStateDir();
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL'); db.pragma('busy_timeout = 5000');
  db.exec(`
    CREATE TABLE IF NOT EXISTS run_state (task_id TEXT PRIMARY KEY, run_id TEXT, project_key TEXT NOT NULL, session_ref TEXT, pid INTEGER, process_instance_id TEXT, process_started_at TEXT, last_seq INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS command_journal (id TEXT PRIMARY KEY, request_hash TEXT NOT NULL, message_json TEXT NOT NULL, status TEXT NOT NULL, response_json TEXT, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS event_outbox (run_id TEXT NOT NULL, seq INTEGER NOT NULL, message_json TEXT NOT NULL, bytes INTEGER NOT NULL, PRIMARY KEY(run_id,seq));
  `);
  return db;
}

async function pair() {
  const pairingCode = process.argv[3];
  const name = process.argv[4] || os.hostname();
  const gatewayUrl = (process.env.PI_GATEWAY_URL || '').replace(/\/$/, '');
  if (!gatewayUrl || !pairingCode) throw new Error('用法: PI_GATEWAY_URL=https://gateway pnpm pair -- 123456 [机器名]');
  const platform = process.platform === 'darwin' ? 'darwin' : process.platform === 'linux' ? 'linux' : null;
  if (!platform) throw new Error('只支持 macOS 与 Linux');
  const response = await fetch(`${gatewayUrl}/runner/v1/pair`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pairingCode, name, platform })
  });
  if (!response.ok) throw new Error(`配对失败: HTTP ${response.status} ${await response.text()}`);
  const result = await response.json() as any;
  ensureStateDir();
  const projects: Project[] = JSON.parse(process.env.PI_RUNNER_PROJECTS || '[]');
  fs.writeFileSync(configPath, JSON.stringify({ gatewayUrl, hostId: result.hostId, credential: result.credential, piExecutable: process.env.PI_EXECUTABLE || 'pi', projects }, null, 2), { mode: 0o600 });
  fs.chmodSync(configPath, 0o600);
  console.log(`已配对 ${name}；请在 ${configPath} 配置 projects 后启动 Runner。`);
}

class Runner {
  private readonly config = loadConfig();
  private readonly piVersion = this.detectPiVersion();
  private readonly db = openDb();
  private socket: WebSocket | null = null;
  private reconnectMs = 1_000;
  private readonly processes = new Map<string, Managed>();
  private readonly projectOwners = new Map<string, string>();
  private readonly sessionPaths = new Map<string, string>();

  start() { this.recoverInterrupted(); this.recoverCommands(); this.connect(); }

  private detectPiVersion() {
    const result = spawnSync(this.config.piExecutable, ['--version'], { encoding: 'utf8', timeout: 10_000, shell: false });
    const version = `${result.stdout || ''} ${result.stderr || ''}`.match(/\d+\.\d+\.\d+/)?.[0] || '';
    if (!version.startsWith('0.84.')) throw new Error(`不兼容的 Pi 版本: ${version || 'unknown'}（需要 0.84.x）`);
    return version;
  }

  private recoverInterrupted() {
    for (const row of this.db.prepare("SELECT * FROM run_state WHERE status IN ('running','cancelling','needs_attention')").all() as any[]) {
      const identity = row.pid ? processIdentity(row.pid) : null;
      let stopped = !identity;
      if (identity && identity === row.process_started_at) {
        try { process.kill(-row.pid, 'SIGTERM'); } catch { try { process.kill(row.pid, 'SIGTERM'); } catch {} }
        stopped = waitForProcessChange(row.pid, identity, 2_000);
        if (!stopped) {
          try { process.kill(-row.pid, 'SIGKILL'); } catch { try { process.kill(row.pid, 'SIGKILL'); } catch {} }
          stopped = waitForProcessChange(row.pid, identity, 1_000);
        }
      }
      const status = stopped ? 'interrupted' : 'needs_attention';
      this.db.prepare('UPDATE run_state SET status=?,pid=? WHERE task_id=?').run(status, stopped ? null : row.pid, row.task_id);
      if (row.run_id && row.status !== 'needs_attention') this.emit(row.run_id, 'run.interrupted', { reason: stopped ? 'runner_restarted' : 'process_identity_unverified', requiresAttention: !stopped });
    }
  }

  private recoverCommands() {
    for (const row of this.db.prepare("SELECT id,status FROM command_journal WHERE status IN ('received','dispatching')").all() as any[]) {
      const status = row.status === 'dispatching' ? 'unknown' : 'rejected';
      const body = { status, response: { error: row.status === 'dispatching' ? 'Runner restarted after dispatch began; execution result is unknown' : 'Runner restarted before dispatch' } };
      this.db.prepare('UPDATE command_journal SET status=?,response_json=? WHERE id=?').run(status, JSON.stringify(body), row.id);
    }
    for (const row of this.db.prepare("SELECT id,message_json FROM command_journal WHERE status='queued'").all() as any[]) {
      const command = PiRunnerCommandSchema.parse(JSON.parse(row.message_json));
      if (command.runId) this.emit(command.runId, 'run.interrupted', { reason: 'runner_restarted_before_dispatch' });
      this.db.prepare("UPDATE command_journal SET status='cancelled' WHERE id=?").run(row.id);
    }
  }

  private connect() {
    const endpoint = this.config.gatewayUrl.replace(/^http/, 'ws') + '/runner/v1/connect';
    const socket = new WebSocket(endpoint, { headers: { Authorization: `Bearer ${this.config.credential}` }, maxPayload: 1024 * 1024 });
    this.socket = socket;
    socket.on('open', () => {
      this.reconnectMs = 1_000;
      const eventCursors = Object.fromEntries((this.db.prepare('SELECT run_id,MAX(seq) seq FROM event_outbox GROUP BY run_id').all() as any[]).map((r) => [r.run_id, r.seq]));
      const platform = process.platform === 'darwin' ? 'darwin' : 'linux';
      socket.send(JSON.stringify(PiRunnerHelloSchema.parse({ type: 'hello', protocolVersion: 1, piVersion: this.piVersion, platform, capabilities: ['prompt','steer','follow_up','abort','set_model','input_response'], projects: this.config.projects.map((p) => ({ key: p.key, name: p.name, displayPath: p.path })), models: this.config.models || [], sessions: this.discoverSessions(), processInstanceId: instanceId, eventCursors })));
      this.flushOutbox();
    });
    socket.on('message', (raw) => this.onGatewayMessage(raw.toString()));
    socket.on('close', (code) => {
      if (code === 4001) { for (const managed of this.processes.values()) this.terminate(managed); return; }
      setTimeout(() => this.connect(), this.jitteredBackoff());
    });
    socket.on('error', () => {});
  }

  private discoverSessions() {
    const root = path.join(os.homedir(), '.pi', 'agent', 'sessions');
    if (!fs.existsSync(root)) return [];
    const sessions: Array<{ projectKey: string; sessionRef: string; name: string; updatedAt: string }> = [];
    for (const dir of fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
      for (const file of fs.readdirSync(path.join(root, dir.name)).filter((name) => name.endsWith('.jsonl'))) {
        const sessionPath = path.join(root, dir.name, file);
        try {
          const header = JSON.parse(fs.readFileSync(sessionPath, 'utf8').split('\n', 1)[0]);
          const project = this.config.projects.find((item) => fs.realpathSync(header.cwd) === item.path);
          if (project) sessions.push({ projectKey: project.key, sessionRef: this.sessionRefFor(sessionPath), name: header.name || file.replace(/\.jsonl$/, ''), updatedAt: fs.statSync(sessionPath).mtime.toISOString() });
        } catch {}
      }
    }
    return sessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 200);
  }

  private sessionRefFor(sessionPath: string) {
    const absolute = path.resolve(sessionPath);
    const real = fs.existsSync(absolute) ? fs.realpathSync(absolute) : path.join(fs.realpathSync(path.dirname(absolute)), path.basename(absolute));
    const ref = `session_${crypto.createHash('sha256').update(real).digest('base64url')}`;
    this.sessionPaths.set(ref, real);
    return ref;
  }

  private bindSession(managed: Managed) {
    if (!managed.sessionPath || !fs.existsSync(managed.sessionPath)) return;
    const sessionRef = this.sessionRefFor(managed.sessionPath);
    this.validateSession(sessionRef, managed.project);
    if (managed.sessionRef === sessionRef) return;
    managed.sessionRef = sessionRef;
    this.db.prepare('UPDATE run_state SET session_ref=? WHERE task_id=?').run(sessionRef, managed.taskId);
    if (managed.runId) this.emit(managed.runId, 'session.updated', { sessionRef });
  }

  private jitteredBackoff() {
    const delay = Math.round(this.reconnectMs * (0.8 + Math.random() * 0.4));
    this.reconnectMs = Math.min(this.reconnectMs * 2, 30_000); return delay;
  }

  private send(message: unknown) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }

  private onGatewayMessage(raw: string) {
    let message: any; try { message = JSON.parse(raw); } catch { return; }
    if (message.type === 'ping') return this.send({ type: 'pong', at: now() });
    if (message.type === 'welcome') {
      for (const [runId, seq] of Object.entries(message.eventCursors || {})) this.ackEvents(runId, Number(seq));
      return this.flushOutbox();
    }
    if (message.type === 'event_ack') return this.ackEvents(message.runId, message.seq);
    const parsed = PiRunnerCommandSchema.safeParse(message);
    if (parsed.success) void this.acceptCommand(parsed.data);
  }

  private async acceptCommand(command: PiRunnerCommand) {
    const existing = this.db.prepare('SELECT * FROM command_journal WHERE id=?').get(command.commandId) as any;
    if (existing) {
      if (existing.request_hash !== command.requestHash) return this.send({ type: 'command_result', commandId: command.commandId, status: 'rejected', response: { error: 'command hash mismatch' } });
      this.send({ type: 'command_ack', commandId: command.commandId });
      if (existing.response_json) this.send({ type: 'command_result', commandId: command.commandId, ...JSON.parse(existing.response_json) });
      return;
    }
    this.db.prepare('INSERT INTO command_journal (id,request_hash,message_json,status,created_at) VALUES (?,?,?,?,?)').run(command.commandId, command.requestHash, JSON.stringify(command), 'received', now());
    this.send({ type: 'command_ack', commandId: command.commandId });
    try {
      if (command.kind === 'follow_up' && this.processes.get(command.taskId)?.runId) {
        const body = { status: 'accepted', response: { queued: true } };
        this.db.prepare("UPDATE command_journal SET status='queued',response_json=? WHERE id=?").run(JSON.stringify(body), command.commandId);
        this.send({ type: 'command_result', commandId: command.commandId, ...body });
        return;
      }
      await this.dispatch(command);
    } catch (error) {
      this.result(command.commandId, 'rejected', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  private project(command: PiRunnerCommand) {
    const project = this.config.projects.find((item) => item.key === command.projectKey);
    if (!project) throw new Error('项目未登记');
    if (this.db.prepare("SELECT 1 FROM run_state WHERE project_key=? AND status='needs_attention'").get(project.key)) throw new Error('项目存在无法验证的旧 Pi 进程，请人工确认后处理 Runner 状态库');
    const real = fs.realpathSync(project.path);
    if (real !== project.path) project.path = real;
    const owner = this.projectOwners.get(projectLockKey(real));
    if (owner && owner !== command.taskId) throw new Error('项目正在被其他任务使用');
    return project;
  }

  private validateSession(sessionRef: string, project: Project) {
    if (!this.sessionPaths.has(sessionRef)) this.discoverSessions();
    const known = this.sessionPaths.get(sessionRef);
    if (!known) throw new Error('会话标识无效');
    const session = fs.realpathSync(known);
    const first = fs.readFileSync(session, 'utf8').split('\n', 1)[0];
    const header = JSON.parse(first);
    if (header.type !== 'session' || fs.realpathSync(header.cwd) !== project.path) throw new Error('会话不属于目标项目');
    return session;
  }

  private async dispatch(command: PiRunnerCommand) {
    const project = this.project(command);
    let managed = this.processes.get(command.taskId);
    if (command.kind === 'prompt' || command.kind === 'follow_up') {
      if (!managed) managed = this.spawnPi(command, project);
      if (managed.runId) throw new Error('任务已有运行中的 run');
      managed.runId = command.runId; managed.aborted = false; managed.started = false; managed.failure = null; managed.modelFailure = null; this.projectOwners.set(projectLockKey(project.path), command.taskId);
      this.db.prepare(`INSERT INTO run_state (task_id,run_id,project_key,session_ref,pid,process_instance_id,process_started_at,status)
        VALUES (?,?,?,?,?,?,?,'running') ON CONFLICT(task_id) DO UPDATE SET run_id=excluded.run_id,pid=excluded.pid,process_instance_id=excluded.process_instance_id,process_started_at=excluded.process_started_at,last_seq=0,status='running'`)
        .run(command.taskId, command.runId, project.key, managed.sessionRef, managed.child.pid, instanceId, managed.child.pid ? processIdentity(managed.child.pid) : null);
      managed.requests.set(command.commandId, command.runId!);
      if (command.payload.provider && command.payload.modelId) this.writeRpc(managed, { id: `${command.commandId}:model`, type: 'set_model', provider: command.payload.provider, modelId: command.payload.modelId });
      this.writeRpc(managed, { id: command.commandId, type: 'prompt', message: String(command.payload.text || '') });
      return;
    }
    if (!managed) throw new Error('Pi 进程未运行');
    managed.requests.set(command.commandId, command.runId || '');
    if (command.kind === 'steer') this.writeRpc(managed, { id: command.commandId, type: 'steer', message: String(command.payload.text || '') });
    if (command.kind === 'set_model') this.writeRpc(managed, { id: command.commandId, type: 'set_model', provider: command.payload.provider, modelId: command.payload.modelId });
    if (command.kind === 'input_response') {
      if (command.payload.processInstanceId !== instanceId) throw new Error('输入请求属于旧的 Pi 实例');
      this.writeRpc(managed, { type: 'extension_ui_response', id: command.payload.requestId, ...(command.payload.response as Record<string, unknown>) }); this.result(command.commandId, 'accepted', {});
    }
    if (command.kind === 'stop') {
      managed.aborted = true;
      for (const row of this.db.prepare("SELECT id,message_json FROM command_journal WHERE status='queued'").all() as any[]) {
        const queued = PiRunnerCommandSchema.parse(JSON.parse(row.message_json));
        if (queued.taskId === command.taskId && queued.runId) { this.emit(queued.runId, 'run.cancelled', { reason: 'queue_cleared' }); this.db.prepare("UPDATE command_journal SET status='cancelled' WHERE id=?").run(row.id); }
      }
      this.db.prepare("UPDATE run_state SET status='cancelling' WHERE task_id=?").run(command.taskId);
      this.writeRpc(managed, { id: command.commandId, type: 'abort' });
      setTimeout(() => this.terminate(managed!), 2_000);
    }
  }

  private spawnPi(command: PiRunnerCommand, project: Project): Managed {
    const args = ['--mode', 'rpc'];
    let sessionRef: string | null = null;
    if (command.sessionRef) { args.push('--session', this.validateSession(command.sessionRef, project)); sessionRef = command.sessionRef; }
    const child = spawn(this.config.piExecutable, args, { cwd: project.path, shell: false, detached: true, stdio: ['pipe','pipe','pipe'], env: { ...process.env, PI_RUNNER_CREDENTIAL: undefined } });
    const managed: Managed = { child, taskId: command.taskId, project, runId: null, sessionRef, sessionPath: null, aborted: false, started: false, failure: null, modelFailure: null, buffer: '', requests: new Map() };
    this.processes.set(command.taskId, managed);
    child.stdout.setEncoding('utf8'); child.stdout.on('data', (chunk) => this.consumePi(managed, chunk));
    let stderrBytes = 0; child.stderr.on('data', (chunk) => { if (stderrBytes < 64 * 1024) { stderrBytes += chunk.length; console.error(`[pi:${command.taskId}] ${String(chunk).trimEnd()}`); } });
    child.on('exit', (code, signal) => this.onPiExit(managed, code, signal));
    this.writeRpc(managed, { id: `state:${command.commandId}`, type: 'get_state' });
    this.writeRpc(managed, { id: `messages:${command.commandId}`, type: 'get_messages' });
    return managed;
  }

  private writeRpc(managed: Managed, message: unknown) {
    if (!managed.child.stdin.writable) throw new Error('Pi stdin 已关闭');
    this.db.prepare("UPDATE command_journal SET status='dispatching' WHERE id=?").run((message as any).id || '');
    managed.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private consumePi(managed: Managed, chunk: string) {
    let processingError: unknown;
    try { consumeJsonLines(managed, chunk, (message) => { try { this.onPiMessage(managed, message); } catch (error) { processingError = error; } }); }
    catch { managed.failure = 'invalid_pi_json'; }
    if (processingError) managed.failure = processingError instanceof Error ? processingError.message : String(processingError);
    if (Buffer.byteLength(managed.buffer) > 1024 * 1024) this.terminate(managed);
  }

  private onPiMessage(managed: Managed, message: any) {
    if (message.type === 'response') {
      if (String(message.id || '').startsWith('state:') && message.success && message.data?.sessionFile) {
        managed.sessionPath = path.resolve(message.data.sessionFile);
        this.bindSession(managed);
        return;
      }
      if (String(message.id || '').startsWith('messages:') && message.success && managed.runId) {
        const messages = [...(Array.isArray(message.data?.messages) ? message.data.messages : Array.isArray(message.data) ? message.data : [])].slice(-200);
        let truncated = false;
        while (messages.length && Buffer.byteLength(JSON.stringify(messages)) > 900 * 1024) { messages.shift(); truncated = true; }
        this.emit(managed.runId, 'messages.snapshot', { messages, truncated });
        return;
      }
      if (message.id) {
        const requestedRun = managed.requests.get(message.id);
        this.result(message.id, message.success ? 'accepted' : 'rejected', message);
        if (!message.success && requestedRun && requestedRun === managed.runId && !managed.started) {
          managed.runId = null;
          this.projectOwners.delete(projectLockKey(managed.project.path));
          this.db.prepare("UPDATE run_state SET run_id=NULL,status='idle' WHERE task_id=?").run(managed.taskId);
        }
      }
      return;
    }
    const runId = managed.runId; if (!runId) return;
    const mapping: Record<string, string> = {
      agent_start: 'run.started', message_start: 'message.started', message_update: 'message.delta', message_end: 'message.completed',
      tool_execution_start: 'tool.started', tool_execution_update: 'tool.progress', tool_execution_end: 'tool.completed',
      extension_ui_request: 'input.required'
    };
    if (mapping[message.type]) {
      if (message.type === 'agent_start') managed.started = true;
      if (message.type === 'message_end') {
        this.bindSession(managed);
        if (message.message?.role === 'assistant') {
          managed.modelFailure = message.message.stopReason === 'error' || message.message.errorMessage
            ? message.message.errorMessage || 'provider_error'
            : message.message.stopReason === 'aborted' ? 'provider_aborted' : null;
        }
      }
      if (message.type === 'extension_ui_request') message = { ...message, processInstanceId: instanceId };
      const encoded = JSON.stringify(message);
      if (message.type === 'tool_execution_end' && Buffer.byteLength(encoded) > 32 * 1024) {
        const outputId = crypto.randomUUID();
        const chunks = encoded.match(/[\s\S]{1,24576}/g) || [];
        for (let index = 0; index < chunks.length && index < 854; index++) this.emit(runId, 'output.chunk', { outputId, chunkIndex: index, text: chunks[index], final: index === chunks.length - 1, truncated: chunks.length > 854 });
        this.emit(runId, mapping[message.type], { toolCallId: message.toolCallId, toolName: message.toolName, outputId, truncated: true });
      } else this.emit(runId, mapping[message.type], message);
    }
    if (message.type === 'agent_settled') {
      this.bindSession(managed);
      if (managed.aborted) return;
      const failure = managed.failure || managed.modelFailure;
      this.emit(runId, failure ? 'run.failed' : 'run.completed', failure ? { reason: 'pi_error', message: failure } : { status: 'succeeded' });
      managed.runId = null; this.projectOwners.delete(projectLockKey(managed.project.path));
      this.db.prepare("UPDATE run_state SET run_id=NULL,status='idle' WHERE task_id=?").run(managed.taskId);
      const next = (this.db.prepare("SELECT message_json FROM command_journal WHERE status='queued' ORDER BY created_at").all() as any[])
        .map((row) => PiRunnerCommandSchema.parse(JSON.parse(row.message_json))).find((command) => command.taskId === managed.taskId);
      if (next && !failure) void this.dispatch(next);
    }
  }

  private emit(runId: string, eventType: string, payload: Record<string, unknown>) {
    const state = this.db.prepare('SELECT last_seq FROM run_state WHERE run_id=? OR task_id=(SELECT task_id FROM run_state WHERE run_id=?)').get(runId, runId) as any;
    const pending = this.db.prepare('SELECT MAX(seq) seq FROM event_outbox WHERE run_id=?').get(runId) as { seq?: number } | undefined;
    const seq = Number(state?.last_seq || pending?.seq || 0) + 1;
    const message = { type: 'event', runId, seq, eventType, occurredAt: now(), payload };
    const encoded = JSON.stringify(message);
    const total = (this.db.prepare('SELECT COALESCE(SUM(bytes),0) bytes FROM event_outbox').get() as any).bytes as number;
    if (total + Buffer.byteLength(encoded) > 256 * 1024 * 1024) throw new Error('event outbox 已满');
    this.db.transaction(() => {
      this.db.prepare('INSERT INTO event_outbox (run_id,seq,message_json,bytes) VALUES (?,?,?,?)').run(runId, seq, encoded, Buffer.byteLength(encoded));
      this.db.prepare('UPDATE run_state SET last_seq=? WHERE run_id=?').run(seq, runId);
    })();
    this.send(message);
  }

  private result(commandId: string, status: 'accepted' | 'rejected' | 'unknown', response: Record<string, unknown>) {
    const body = { status, response };
    this.db.prepare('UPDATE command_journal SET status=?,response_json=? WHERE id=?').run(status, JSON.stringify(body), commandId);
    this.send({ type: 'command_result', commandId, ...body });
  }

  private ackEvents(runId: string, seq: number) { this.db.prepare('DELETE FROM event_outbox WHERE run_id=? AND seq<=?').run(runId, seq); }
  private flushOutbox() { for (const row of this.db.prepare('SELECT message_json FROM event_outbox ORDER BY run_id,seq').all() as any[]) this.send(JSON.parse(row.message_json)); }

  private terminate(managed: Managed) {
    if (managed.child.exitCode !== null || !managed.child.pid) return;
    try { process.kill(-managed.child.pid, 'SIGTERM'); } catch { managed.child.kill('SIGTERM'); }
    setTimeout(() => { if (managed.child.exitCode === null && managed.child.pid) { try { process.kill(-managed.child.pid, 'SIGKILL'); } catch { managed.child.kill('SIGKILL'); } } }, 3_000);
  }

  private onPiExit(managed: Managed, code: number | null, signal: NodeJS.Signals | null) {
    this.processes.delete(managed.taskId); this.projectOwners.delete(projectLockKey(managed.project.path));
    if (managed.runId) this.emit(managed.runId, managed.aborted ? 'run.cancelled' : 'run.interrupted', { code, signal });
    this.db.prepare("UPDATE run_state SET status=?,pid=NULL,run_id=NULL WHERE task_id=?").run(managed.aborted ? 'cancelled' : 'interrupted', managed.taskId);
  }
}

async function main() {
  if (process.argv[2] === 'pair') return pair();
  if (process.argv[2] !== 'start') throw new Error('用法: pi-runner pair|start');
  acquireInstanceLock();
  new Runner().start();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
