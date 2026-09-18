import { describe, it, expect } from 'vitest';
import { LlmClient } from '../src/llm.js';

describe('LlmClient.extractStreamDelta', () => {
  it('reads OpenAI chat completion token deltas', () => {
    const delta = LlmClient.extractStreamDelta(
      { choices: [{ delta: { content: '你好' } }] },
      'openai-completions'
    );
    expect(delta).toBe('你好');
  });

  it('reads array-shaped delta content', () => {
    const delta = LlmClient.extractStreamDelta(
      { choices: [{ delta: { content: [{ type: 'text', text: 'Hello' }] } }] },
      'openai-completions'
    );
    expect(delta).toBe('Hello');
  });

  it('reads Anthropic text_delta events', () => {
    const delta = LlmClient.extractStreamDelta(
      { type: 'content_block_delta', delta: { type: 'text_delta', text: '世界' } },
      'anthropic-messages'
    );
    expect(delta).toBe('世界');
  });

  it('ignores Anthropic non-text events', () => {
    const delta = LlmClient.extractStreamDelta(
      { type: 'message_start', message: { id: 'msg_1' } },
      'anthropic-messages'
    );
    expect(delta).toBe('');
  });
});
