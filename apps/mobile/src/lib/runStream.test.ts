import { describe, it, expect } from 'vitest';
import { parseSseChunk } from './runStream';

describe('parseSseChunk', () => {
  it('parses named SSE envelopes used by the run event stream', () => {
    const chunk = [
      'id: 3',
      'event: message.delta',
      'data: {"v":1,"seq":3,"type":"message.delta","payload":{"delta":"好","fullText":"你好"}}'
    ].join('\n');

    const parsed = parseSseChunk(chunk);
    expect(parsed?.type).toBe('message.delta');
    expect(parsed?.payload.fullText).toBe('你好');
  });

  it('ignores heartbeat comments', () => {
    expect(parseSseChunk(': ping')).toBeNull();
  });
});
