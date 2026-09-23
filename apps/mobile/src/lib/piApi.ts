import { CLIENT_ID } from './auth';
import { handle401Unauthorized } from './aiApi';
import { readSseStream, type RunStreamEvent } from './runStream';

export type PiHost = { id: string; name: string; platform: string; pi_version: string; online: boolean; last_seen_at?: string };
export type PiProject = { id: string; name: string; display_path: string };
export type PiTask = { id: string; title: string; project_id: string; project_name: string; host_id: string; host_name: string; online: boolean; updated_at: string; runs?: PiRun[] };
export type PiRun = { id: string; status: string; activity?: string; created_at: string };
export type PiModel = { provider: string; modelId: string; name?: string };
export type PiSession = { sessionRef: string; name: string; updatedAt: string };

const base = (serverUrl: string) => `${serverUrl.replace(/\/$/, '').replace(/\/api$/, '')}/api/ai/pi`;
const headers = (token: string, json = false) => ({ Authorization: `Bearer ${token}`, clientid: CLIENT_ID, ...(json ? { 'Content-Type': 'application/json' } : {}) });

async function request<T>(serverUrl: string, token: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base(serverUrl)}${path}`, { ...init, headers: { ...headers(token, Boolean(init?.body)), ...(init?.headers || {}) } });
  const data = await response.json().catch(() => ({}));
  if (response.status === 401 || data?.code === 401) handle401Unauthorized();
  if (!response.ok || (typeof data?.code === 'number' && data.code !== 200)) throw new Error(data?.error?.message || data?.msg || `HTTP ${response.status}`);
  return (data?.code === 200 && data?.data !== undefined ? data.data : data) as T;
}

export const listPiHosts = (s: string, t: string) => request<{ items: PiHost[] }>(s, t, '/hosts');
export const createPiPairingCode = (s: string, t: string) => request<{ code: string; expiresAt: string }>(s, t, '/pairing-codes', { method: 'POST' });
export const revokePiHost = (s: string, t: string, hostId: string) => request<{ success: boolean }>(s, t, `/hosts/${hostId}/revoke`, { method: 'POST' });
export const listPiProjects = (s: string, t: string, hostId: string) => request<{ items: PiProject[] }>(s, t, `/hosts/${hostId}/projects`);
export const listPiModels = (s: string, t: string, projectId: string) => request<{ items: PiModel[]; cached: boolean }>(s, t, `/projects/${projectId}/models`);
export const listPiSessions = (s: string, t: string, projectId: string) => request<{ items: PiSession[] }>(s, t, `/projects/${projectId}/sessions`);
export const listPiTasks = (s: string, t: string, hostId = '') => request<{ items: PiTask[] }>(s, t, `/tasks?limit=100${hostId ? `&hostId=${encodeURIComponent(hostId)}` : ''}`);
export const getPiTask = (s: string, t: string, id: string) => request<PiTask>(s, t, `/tasks/${id}`);
export async function getPiRunEvents(s: string, t: string, runId: string) {
  const items: RunStreamEvent[] = [];
  let after = 0;
  let status = '';
  for (;;) {
    const page = await request<{ status: string; items: RunStreamEvent[] }>(s, t, `/runs/${runId}/events?format=json&after=${after}`);
    status = page.status;
    if (!page.items.length) break;
    const last = Number(page.items.at(-1)?.seq);
    if (!Number.isSafeInteger(last) || last <= after) throw new Error('历史事件游标没有前进');
    items.push(...page.items); after = last;
    if (page.items.length < 500) break;
  }
  return { status, items };
}

export async function getPiOutput(s: string, t: string, runId: string, outputId: string) {
  let cursor = 0;
  const chunks: Array<{ chunkIndex: number; text: string }> = [];
  for (;;) {
    const page = await request<{ items: Array<{ chunkIndex: number; text: string }>; nextCursor: number | null }>(s, t, `/runs/${runId}/outputs/${outputId}?cursor=${cursor}`);
    chunks.push(...page.items);
    if (!page.nextCursor || page.nextCursor <= cursor) break;
    cursor = page.nextCursor;
  }
  const text = chunks.sort((a, b) => a.chunkIndex - b.chunkIndex).map((part) => part.text).join('');
  try { return JSON.parse(text).result ?? text; } catch { return text; }
}
export const createPiTask = (s: string, t: string, body: { projectId: string; title: string; sessionRef?: string; terminalExitedConfirmed?: boolean }) => request<PiTask>(s, t, '/tasks', { method: 'POST', body: JSON.stringify({ clientRequestId: crypto.randomUUID(), ...body }) });
export const sendPiCommand = (s: string, t: string, taskId: string, body: Record<string, unknown>) => request<{ commandId: string; runId: string | null; status: string }>(s, t, `/tasks/${taskId}/commands`, { method: 'POST', body: JSON.stringify({ clientRequestId: crypto.randomUUID(), ...body }) });
export const archivePiTask = (s: string, t: string, taskId: string) => request<{ success: boolean }>(s, t, `/tasks/${taskId}/archive`, { method: 'POST' });

export async function subscribePiRun(serverUrl: string, token: string, runId: string, after: number, onEvent: (event: RunStreamEvent) => void, signal: AbortSignal) {
  let cursor = after;
  const pending = new Map<number, RunStreamEvent>();
  let finished = false;
  while (!signal.aborted && !finished) {
    try {
      const response = await fetch(`${base(serverUrl)}/runs/${runId}/events?after=${cursor}`, { headers: headers(token), signal });
      if (response.status === 401) { handle401Unauthorized(); return; }
      if (response.headers.get('content-type')?.includes('application/json')) {
        const data = await response.json();
        if (data?.code === 401) { handle401Unauthorized(); return; }
        throw new Error(data?.msg || '事件流连接失败');
      }
      if (!response.ok || !response.body) throw new Error(`事件流连接失败: HTTP ${response.status}`);
      await readSseStream(response.body, (event) => {
        const seq = Number(event.seq) || 0;
        if (seq > cursor) pending.set(seq, event);
        while (pending.has(cursor + 1)) {
          const next = pending.get(++cursor)!; pending.delete(cursor); onEvent(next);
          if (['run.completed', 'run.failed', 'run.cancelled', 'run.interrupted'].includes(next.type)) finished = true;
        }
      }, signal);
    } catch (error) {
      if (signal.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
    }
    if (!signal.aborted && !finished) await new Promise((resolve) => setTimeout(resolve, 600));
  }
}
