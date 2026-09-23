import { afterEach, expect, it, vi } from 'vitest';
vi.mock('./auth', () => ({ CLIENT_ID: 'test' }));
vi.mock('./aiApi', () => ({ handle401Unauthorized: vi.fn() }));
import { getPiRunEvents, listPiHosts, subscribePiRun } from './piApi';
import { handle401Unauthorized } from './aiApi';

afterEach(() => vi.unstubAllGlobals());
it('loads all 1201 events across pages, including the final completion', async () => {
  const events = Array.from({ length: 1201 }, (_, i) => ({ runId: 'run', seq: i + 1, type: i === 1200 ? 'run.completed' : 'message.delta' }));
  const fetch = vi.fn(async (input: string) => {
    const after = Number(new URL(input).searchParams.get('after'));
    return new Response(JSON.stringify({ status: 'succeeded', items: events.slice(after, after + 500) }));
  });
  vi.stubGlobal('fetch', fetch);
  const history = await getPiRunEvents('https://example.test', 'test-token', 'run');
  expect(history.items).toEqual(events);
  expect(fetch).toHaveBeenCalledTimes(3);
});

it('handles RuoYi HTTP 200 responses carrying code 401 for JSON and SSE', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ code: 401, msg: '登录过期' }), { headers: { 'content-type': 'application/json' } })));
  await expect(listPiHosts('https://example.test', 'expired')).rejects.toThrow('登录过期');
  await subscribePiRun('https://example.test', 'expired', 'run', 0, vi.fn(), new AbortController().signal);
  expect(handle401Unauthorized).toHaveBeenCalledTimes(2);
});
