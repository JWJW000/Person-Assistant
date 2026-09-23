import { describe, expect, it } from 'vitest';
import { consumeJsonLines } from '../src/index.js';

describe('Pi JSONL framing', () => {
  it('keeps UTF-8 content and only splits on LF', () => {
    const state = { buffer: '' };
    const values: unknown[] = [];
    consumeJsonLines(state, '{"text":"前半', (value) => values.push(value));
    consumeJsonLines(state, '段 仍是一行"}\r\n{"ok":true}\npart', (value) => values.push(value));
    expect(values).toEqual([{ text: '前半段 仍是一行' }, { ok: true }]);
    expect(state.buffer).toBe('part');
  });
});
