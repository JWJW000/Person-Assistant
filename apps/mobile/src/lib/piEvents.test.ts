import { expect, it } from 'vitest';
import { piDisplayItems } from './piEvents';
import type { RunStreamEvent } from './runStream';

it('renders native RPC deltas once, replaces completion and merges tools', () => {
  const events = [
    ['message.started', { message: { role: 'assistant' } }],
    ['message.delta', { assistantMessageEvent: { type: 'text_delta', delta: '你好' } }],
    ['message.delta', { assistantMessageEvent: { type: 'thinking_delta', delta: 'internal' } }],
    ['message.delta', { assistantMessageEvent: { type: 'text_delta', delta: '，完成了' } }],
    ['message.completed', { message: { role: 'assistant', content: [{ type: 'text', text: '你好，完成了。' }] } }],
    ['tool.started', { toolCallId: 'read-1', toolName: 'read', args: { path: 'a.txt' } }],
    ['tool.progress', { toolCallId: 'read-1', partialResult: { content: [{ type: 'text', text: 'part' }] } }],
    ['tool.completed', { toolCallId: 'read-1', result: { content: [{ type: 'text', text: 'full output' }] } }],
  ].map(([type, payload], i) => ({ runId: 'run', seq: i + 1, type, payload })) as RunStreamEvent[];
  const items = piDisplayItems([...events, events[1]]);
  expect(items).toHaveLength(2);
  expect(items[0].text).toBe('你好，完成了。');
  expect(items[1]).toMatchObject({ title: 'read', status: '完成', text: 'full output' });
});


it('shows streaming state only while an assistant response is being generated', () => {
  const delta = { runId: 'run', seq: 1, type: 'message.delta', payload: { textDelta: '正在检查服务器' } } as RunStreamEvent;
  expect(piDisplayItems([delta])[0]).toMatchObject({ text: '正在检查服务器', streaming: true });
  for (const type of ['run.completed', 'run.failed', 'run.cancelled', 'run.interrupted']) {
    expect(piDisplayItems([delta, { runId: 'run', seq: 2, type, payload: {} } as RunStreamEvent])[0].streaming).toBe(false);
  }
  expect(piDisplayItems([delta, { runId: 'run', seq: 2, type: 'message.completed', payload: { fullText: '检查完成' } } as RunStreamEvent])[0]).toMatchObject({ text: '检查完成', streaming: false });
});
