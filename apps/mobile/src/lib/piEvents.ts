import type { RunStreamEvent } from './runStream';

export type PiDisplayItem = {
  id: string; runId: string; kind: 'message' | 'tool' | 'error';
  role?: string; text: string; title?: string; status?: string; outputId?: string; streaming?: boolean;
};

export function piContentText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((part) => part?.type === 'text').map((part) => part.text || '').join('\n');
  if (content && typeof content === 'object' && 'content' in content) return piContentText(content.content);
  return content == null ? '' : JSON.stringify(content, null, 2);
}

// Fold persisted and live RPC events the same way; completion replaces deltas.
export function piDisplayItems(events: RunStreamEvent[]): PiDisplayItem[] {
  const items: PiDisplayItem[] = [];
  const streaming = new Map<string, PiDisplayItem>();
  const tools = new Map<string, PiDisplayItem>();
  const seen = new Set<string>();
  for (const event of events) {
    const runId = event.runId || '';
    const id = `${runId}:${event.seq}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const p = event.payload || {};
    if (event.type === 'messages.snapshot' && !items.some((item) => item.kind === 'message')) {
      for (const [index, message] of (p.messages || []).entries()) {
        if (!['user', 'assistant'].includes(message.role)) continue;
        const text = piContentText(message.content);
        if (text) items.push({ id: `${id}:${index}`, runId, kind: 'message', role: message.role, text });
      }
    } else if (event.type === 'message.started') {
      if (p.message?.role === 'assistant') {
        const previous = streaming.get(runId);
        if (previous) previous.streaming = false;
        streaming.delete(runId);
      }
    } else if (event.type === 'message.delta') {
      const delta = p.assistantMessageEvent;
      const text = delta ? (delta.type === 'text_delta' ? delta.delta : '') : p.textDelta || p.delta || '';
      if (typeof text !== 'string' || !text) continue;
      let item = streaming.get(runId);
      if (!item) {
        item = { id, runId, kind: 'message', role: 'assistant', text: '', streaming: true };
        streaming.set(runId, item); items.push(item);
      }
      item.text += text;
    } else if (event.type === 'message.completed') {
      const role = p.message?.role || 'assistant';
      if (!['user', 'assistant'].includes(role)) continue;
      const text = piContentText(p.message?.content ?? p.fullText ?? p.text);
      const item = role === 'assistant' ? streaming.get(runId) : undefined;
      if (item) { item.text = text || item.text; item.streaming = false; streaming.delete(runId); }
      else if (text) items.push({ id, runId, kind: 'message', role, text });
    } else if (event.type.startsWith('tool.')) {
      const key = `${runId}:${p.toolCallId}`;
      let item = tools.get(key);
      if (!item) {
        item = { id: key, runId, kind: 'tool', title: p.toolName || '工具', text: '' };
        tools.set(key, item); items.push(item);
      }
      item.status = event.type === 'tool.completed' ? (p.isError ? '失败' : '完成') : '执行中';
      item.text = piContentText(p.result ?? p.partialResult ?? p.args ?? p.arguments ?? item.text);
      item.outputId = p.outputId || item.outputId;
    } else if (event.type === 'run.failed' || event.type === 'run.interrupted') {
      items.push({ id, runId, kind: 'error', text: p.message || p.response?.error || p.reason || '执行中断' });
    }
    if (['run.completed', 'run.failed', 'run.interrupted', 'run.cancelled'].includes(event.type)) {
      const item = streaming.get(runId);
      if (item) item.streaming = false;
      streaming.delete(runId);
    }
  }
  return items;
}
