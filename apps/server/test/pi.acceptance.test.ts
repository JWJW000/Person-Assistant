import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import fastify from 'fastify';
import WebSocket from 'ws';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createDatabase, migrate } from '../src/db/index.js';
import { registerPi } from '../src/pi.js';

// Acceptance requirements from docs/PI_REMOTE_IMPLEMENTATION_PLAN.md.
// Build @assistant/pi-runner before running this file. All state is temporary;
// the fake Pi never calls a model or operates on the user's project.
let app: ReturnType<typeof fastify>;
let db: ReturnType<typeof createDatabase>;
let address: string;
let directory: string;
let hostId: string;
let projectId: string;
let taskId: string;
let runId: string;
let ws: WebSocket | undefined;
let runner: ChildProcess | undefined;
let runnerLog: string;
const token = 'acceptance-internal-token';
const credential = 'acceptance-runner-token';
const headers = { authorization: `Bearer ${token}`, 'x-pi-user-id': 'acceptance', 'x-pi-tenant-id': 'default' };

it('rejects HTTP/2 upgrades promptly instead of hanging the Java proxy', async () => {
  const status = await new Promise<number | undefined>((resolve, reject) => {
    const req = httpRequest(`${address}/internal/pi/hosts`, { headers: { ...headers, Connection: 'Upgrade, HTTP2-Settings', Upgrade: 'h2c', 'HTTP2-Settings': 'AAMAAABkAAQAAP__' } }, (response) => {
      response.resume(); resolve(response.statusCode);
    });
    req.setTimeout(2000, () => req.destroy(new Error('HTTP upgrade hung')));
    req.on('error', reject); req.end();
  });
  expect(status).toBe(426);
  const normal = await app.inject({ method: 'GET', url: '/internal/pi/hosts', headers });
  expect(normal.statusCode).toBe(200);
  expect(normal.json().items).toHaveLength(1);
});

beforeEach(async () => {
  process.env.PI_INTERNAL_TOKEN = token;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-acceptance-'));
  db = createDatabase(':memory:'); migrate(db);
  app = fastify(); registerPi(app, db);
  hostId = crypto.randomUUID(); projectId = crypto.randomUUID();
  taskId = crypto.randomUUID(); runId = crypto.randomUUID(); runnerLog = '';
  const now = new Date().toISOString();
  db.prepare('INSERT INTO pi_hosts (id,owner_user_id,tenant_id,name,platform,credential_hash,expires_at) VALUES (?,?,?,?,?,?,?)')
    .run(hostId, 'acceptance', 'default', 'Test', 'darwin', crypto.createHash('sha256').update(credential).digest('hex'), '2099-01-01T00:00:00Z');
  db.prepare('INSERT INTO pi_projects (id,host_id,runner_project_key,name,display_path) VALUES (?,?,?,?,?)')
    .run(projectId, hostId, 'test', 'Test', directory);
  db.prepare('INSERT INTO pi_tasks (id,project_id,title,created_at,updated_at) VALUES (?,?,?,?,?)')
    .run(taskId, projectId, 'Test', now, now);
  db.prepare('INSERT INTO pi_runs (id,task_id,status,created_at) VALUES (?,?,?,?)').run(runId, taskId, 'running', now);
  address = await app.listen({ host: '127.0.0.1', port: 0 });
});

afterEach(async () => {
  // Only terminate fake Pi children owned by this test's Runner database.
  const runnerDb = path.join(directory, 'runner.sqlite');
  if (fs.existsSync(runnerDb)) {
    const state = createDatabase(runnerDb);
    for (const row of state.prepare('SELECT pid FROM run_state WHERE pid IS NOT NULL').all() as { pid: number }[]) {
      try { process.kill(-row.pid, 'SIGKILL'); } catch { /* Already exited. */ }
    }
    state.close();
  }
  if (runner && runner.exitCode === null && runner.signalCode === null) {
    const exited = once(runner, 'exit'); runner.kill('SIGKILL'); await exited;
  }
  runner = undefined;
  ws?.terminate(); ws = undefined;
  await app.close(); db.close(); fs.rmSync(directory, { recursive: true, force: true });
});

async function connectFakeRunner() {
  ws = new WebSocket(address.replace('http', 'ws') + '/runner/v1/connect', { headers: { authorization: `Bearer ${credential}` } });
  const messages: any[] = [];
  ws.on('message', (raw) => messages.push(JSON.parse(raw.toString())));
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'hello', protocolVersion: 1, piVersion: '0.84.2', platform: 'darwin', capabilities: ['prompt'], projects: [], processInstanceId: crypto.randomUUID(), eventCursors: {} }));
  await vi.waitFor(() => expect(messages.some((m) => m.type === 'welcome')).toBe(true));
  return messages;
}

function event(seq: number, eventType: string) {
  return { type: 'event', runId, seq, eventType, occurredAt: new Date().toISOString(), payload: {} };
}

it('reconnect acknowledges only the continuous event prefix', async () => {
  await connectFakeRunner();
  ws!.send(JSON.stringify(event(2, 'message.delta')));
  await vi.waitFor(() => expect(db.prepare('SELECT COUNT(*) n FROM pi_events').get()).toEqual({ n: 1 }));
  ws!.terminate();
  const messages = await connectFakeRunner();
  expect(messages.find((m) => m.type === 'welcome').eventCursors[runId] || 0).toBe(0);
});

it('replaying an old start event cannot reopen a completed run', async () => {
  await connectFakeRunner();
  const started = event(1, 'run.started');
  ws!.send(JSON.stringify(started));
  ws!.send(JSON.stringify(event(2, 'run.completed')));
  await vi.waitFor(() => expect((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(runId) as any).status).toBe('succeeded'));
  ws!.send(JSON.stringify(started));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(runId) as any).status).toBe('succeeded');
});

it('a rejected initial prompt releases its queued run', async () => {
  db.prepare("UPDATE pi_runs SET status='succeeded' WHERE id=?").run(runId);
  const messages = await connectFakeRunner();
  const submitted = await app.inject({ method: 'POST', url: `/internal/pi/tasks/${taskId}/commands`, headers, payload: { clientRequestId: crypto.randomUUID(), kind: 'prompt', payload: { text: 'test' } } });
  expect(submitted.statusCode).toBe(202);
  const command = submitted.json();
  await vi.waitFor(() => expect(messages.some((m) => m.commandId === command.commandId)).toBe(true));
  ws!.send(JSON.stringify({ type: 'command_result', commandId: command.commandId, status: 'rejected', response: { error: 'session unavailable' } }));
  await vi.waitFor(() => expect((db.prepare('SELECT status FROM pi_commands WHERE id=?').get(command.commandId) as any).status).toBe('rejected'));
  expect((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(command.runId) as any).status).toBe('failed');
});

it('reconnect reconciles a command whose dispatch outcome is unknown', async () => {
  db.prepare("UPDATE pi_runs SET status='succeeded' WHERE id=?").run(runId);
  const firstConnection = await connectFakeRunner();
  const submitted = await app.inject({ method: 'POST', url: `/internal/pi/tasks/${taskId}/commands`, headers, payload: { clientRequestId: crypto.randomUUID(), kind: 'prompt', payload: { text: 'test' } } });
  const command = submitted.json();
  await vi.waitFor(() => expect(firstConnection.some((message) => message.commandId === command.commandId)).toBe(true));
  ws!.terminate();
  const reconnected = await connectFakeRunner();
  await vi.waitFor(() => expect(reconnected.some((message) => message.commandId === command.commandId)).toBe(true));
  ws!.send(JSON.stringify({ type: 'command_result', commandId: command.commandId, status: 'unknown', response: { error: 'runner restarted after dispatch' } }));
  await vi.waitFor(() => expect((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(command.runId) as any).status).toBe('interrupted'));
});

it.each([false, true])('Runner enforces a single process and recovers stale PID locks: %s', async (staleLock) => {
  const executable = path.join(directory, 'fake-pi');
  fs.writeFileSync(executable, `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('0.84.2'); process.exit(0); }
require('node:readline').createInterface({ input: process.stdin });
`, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ gatewayUrl: address, hostId, credential, piExecutable: executable, projects: [{ key: 'test', name: 'Test', path: directory }] }));
  const args = [path.resolve('apps/pi-runner/dist/index.js'), 'start'];
  if (staleLock) fs.writeFileSync(path.join(directory, 'runner.lock'), JSON.stringify({ pid: process.pid, instanceId: 'previous-boot', processStartedAt: 'previous-boot-identity' }));
  runner = spawn(process.execPath, args, { env: { ...process.env, PI_RUNNER_STATE_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  await vi.waitFor(async () => {
    const hosts = (await app.inject({ method: 'GET', url: '/internal/pi/hosts', headers })).json();
    expect(hosts.items[0].online).toBe(true);
  }, { timeout: 4000 });
  const duplicate = spawn(process.execPath, args, { env: { ...process.env, PI_RUNNER_STATE_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  let duplicateError = ''; duplicate.stderr.on('data', (chunk) => { duplicateError += chunk; });
  const [code] = await once(duplicate, 'exit');
  expect(code).toBe(1); expect(duplicateError).toContain('已有 Pi Runner 正在运行');
});

it('stop keeps the project occupied until the Pi process exits', async () => {
  db.prepare("UPDATE pi_runs SET status='succeeded' WHERE id=?").run(runId);
  const executable = path.join(directory, 'fake-pi');
  const session = path.join(directory, 'session.jsonl');
  fs.writeFileSync(session, JSON.stringify({ type: 'session', cwd: directory }) + '\n');
  fs.writeFileSync(executable, `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('0.84.2'); process.exit(0); }
const send = value => console.log(JSON.stringify(value));
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const c = JSON.parse(line);
  if (c.type === 'get_state') send({type:'response',id:c.id,success:true,data:{sessionFile:${JSON.stringify(session)}}});
  if (c.type === 'get_messages') send({type:'response',id:c.id,success:true,data:{messages:[]}});
  if (c.type === 'prompt') { send({type:'response',id:c.id,success:true}); send({type:'agent_start'}); }
  if (c.type === 'abort') { send({type:'response',id:c.id,success:true}); send({type:'agent_settled'}); }
});
`, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ gatewayUrl: address, hostId, credential, piExecutable: executable, projects: [{ key: 'test', name: 'Test', path: directory }] }));
  runner = spawn(process.execPath, [path.resolve('apps/pi-runner/dist/index.js'), 'start'], { env: { ...process.env, PI_RUNNER_STATE_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  await vi.waitFor(async () => expect((await app.inject({ method: 'GET', url: '/internal/pi/hosts', headers })).json().items[0].online).toBe(true), { timeout: 4000 });
  const prompt = (await app.inject({ method: 'POST', url: `/internal/pi/tasks/${taskId}/commands`, headers, payload: { clientRequestId: crypto.randomUUID(), kind: 'prompt', payload: { text: 'test' } } })).json();
  await vi.waitFor(() => expect((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(prompt.runId) as any).status).toBe('running'));
  expect((await app.inject({ method: 'POST', url: `/internal/pi/tasks/${taskId}/commands`, headers, payload: { clientRequestId: crypto.randomUUID(), kind: 'stop', runId: prompt.runId, payload: {} } })).statusCode).toBe(202);
  await new Promise((resolve) => setTimeout(resolve, 200));
  expect((await app.inject({ method: 'POST', url: `/internal/pi/tasks/${taskId}/commands`, headers, payload: { clientRequestId: crypto.randomUUID(), kind: 'prompt', payload: { text: 'too early' } } })).statusCode).toBe(409);
  await vi.waitFor(() => expect((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(prompt.runId) as any).status).toBe('cancelled'), { timeout: 5000 });
  expect((await app.inject({ method: 'POST', url: `/internal/pi/tasks/${taskId}/commands`, headers, payload: { clientRequestId: crypto.randomUUID(), kind: 'prompt', payload: { text: 'after exit' } } })).statusCode).toBe(202);
});

it.each(['provider_error', 'new_session', 'provider_recovered'])('Runner preserves the required outcome for %s', async (scenario) => {
  db.prepare("UPDATE pi_runs SET status='succeeded' WHERE id=?").run(runId);
  const executable = path.join(directory, 'fake-pi');
  const session = path.join(directory, 'session.jsonl');
  const sessionHeader = JSON.stringify({ type: 'session', cwd: directory }) + '\n';
  if (scenario === 'provider_error') fs.writeFileSync(session, sessionHeader);
  fs.writeFileSync(executable, `#!/usr/bin/env node
if (process.argv.includes('--version')) { console.log('0.84.2'); process.exit(0); }
const send = value => console.log(JSON.stringify(value));
require('node:readline').createInterface({ input: process.stdin }).on('line', line => {
  const c = JSON.parse(line);
  if (c.type === 'get_state') send({type:'response',id:c.id,success:true,data:{sessionFile:${JSON.stringify(session)}}});
  if (c.type === 'get_messages') send({type:'response',id:c.id,success:true,data:{messages:[]}});
  if (c.type === 'prompt') {
    setTimeout(() => {
    require('node:fs').writeFileSync(${JSON.stringify(session)}, ${JSON.stringify(sessionHeader)});
    send({type:'response',id:c.id,success:true}); send({type:'agent_start'});
    if (${JSON.stringify(scenario)} === 'provider_recovered') {
      send({type:'message_end',message:{role:'assistant',content:[],stopReason:'error',errorMessage:'transient provider error'}});
      send({type:'agent_end',willRetry:true});
      send({type:'auto_retry_start',attempt:1,maxAttempts:3});
      send({type:'auto_retry_end',success:true,attempt:1});
    }
    send({type:'message_end',message:{role:'assistant',content:[],stopReason:${JSON.stringify(scenario === 'provider_error' ? 'error' : 'stop')},errorMessage:${JSON.stringify(scenario === 'provider_error' ? 'simulated provider error' : '')}}});
    send({type:'agent_end',willRetry:false}); send({type:'agent_settled'});
    }, 100);
  }
});
`, { mode: 0o700 });
  fs.writeFileSync(path.join(directory, 'config.json'), JSON.stringify({ gatewayUrl: address, hostId, credential, piExecutable: executable, projects: [{ key: 'test', name: 'Test', path: directory }] }));
  runner = spawn(process.execPath, [path.resolve('apps/pi-runner/dist/index.js'), 'start'], { env: { ...process.env, PI_RUNNER_STATE_DIR: directory }, stdio: ['ignore', 'pipe', 'pipe'] });
  runner.stderr!.on('data', (chunk) => { runnerLog += chunk; });
  await vi.waitFor(async () => {
    const hosts = (await app.inject({ method: 'GET', url: '/internal/pi/hosts', headers })).json();
    expect(hosts.items[0].online, runnerLog).toBe(true);
  }, { timeout: 4000 });
  const response = await app.inject({ method: 'POST', url: `/internal/pi/tasks/${taskId}/commands`, headers, payload: { clientRequestId: crypto.randomUUID(), kind: 'prompt', payload: { text: 'test' } } });
  expect(response.statusCode).toBe(202);
  const submittedRun = response.json().runId;
  await vi.waitFor(() => expect((db.prepare("SELECT COUNT(*) n FROM pi_events WHERE run_id=? AND type='message.completed'").get(submittedRun) as any).n).toBe(scenario === 'provider_recovered' ? 2 : 1), { timeout: 4000 });
  await vi.waitFor(() => expect(['failed', 'succeeded']).toContain((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(submittedRun) as any).status));
  if (scenario === 'provider_error') {
    expect((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(submittedRun) as any).status).toBe('failed');
  } else if (scenario === 'provider_recovered') {
    expect((db.prepare('SELECT status FROM pi_runs WHERE id=?').get(submittedRun) as any).status).toBe('succeeded');
  } else {
    expect((db.prepare('SELECT session_ref FROM pi_tasks WHERE id=?').get(taskId) as any).session_ref).toBeTruthy();
  }
});
