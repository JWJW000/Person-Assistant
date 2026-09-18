export type LlmApi = 'openai-completions' | 'openai-responses' | 'anthropic-messages';

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  modelId: string;
  api?: LlmApi | string;
  timeoutMs?: number;
  temperature?: number;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export class LlmError extends Error {
  constructor(
    public code: 'RELAY_NOT_CONFIGURED' | 'RELAY_AUTH_FAILED' | 'RELAY_PROTOCOL_ERROR' | 'RELAY_TIMEOUT',
    message: string
  ) {
    super(message);
    this.name = 'LlmError';
  }
}

/**
 * 极简的中转站(Relay)客户端，支持非流式与实时流式传输 (SSE)。
 */
export class LlmClient {
  constructor(private config: LlmConfig) {}

  public async chat(messages: LlmMessage[], opts: { temperature?: number } = {}): Promise<string> {
    const { baseUrl, apiKey, modelId } = this.config;
    if (!baseUrl || !apiKey || !modelId) {
      throw new LlmError('RELAY_NOT_CONFIGURED', '缺少中转站 baseUrl / apiKey / modelId');
    }

    const api = (this.config.api || 'openai-completions') as LlmApi;
    const url = baseUrl.replace(/\/+$/, '');
    const temperature = opts.temperature ?? this.config.temperature ?? 0.2;
    const timeoutMs = this.config.timeoutMs ?? 30000;

    let endpoint = '';
    let headers: Record<string, string> = { 'Content-Type': 'application/json' };
    let body: Record<string, any> = {};

    if (api === 'anthropic-messages') {
      endpoint = `${url}/messages`;
      headers = {
        ...headers,
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      };
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      body = {
        model: modelId,
        max_tokens: 1024,
        temperature,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
        ...(system ? { system } : {})
      };
    } else if (api === 'openai-responses') {
      endpoint = `${url}/responses`;
      headers = { ...headers, Authorization: `Bearer ${apiKey}` };
      body = {
        model: modelId,
        input: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature
      };
    } else {
      endpoint = `${url}/chat/completions`;
      headers = { ...headers, Authorization: `Bearer ${apiKey}` };
      body = { model: modelId, messages, temperature };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new LlmError('RELAY_TIMEOUT', `中转站请求超时 (${timeoutMs}ms)`);
      }
      throw new LlmError('RELAY_PROTOCOL_ERROR', `无法连接中转站: ${err?.message || err}`);
    } finally {
      clearTimeout(timer);
    }

    const raw = await res.text();
    if (res.status === 401 || res.status === 403) {
      throw new LlmError('RELAY_AUTH_FAILED', `中转站鉴权失败 (HTTP ${res.status})`);
    }
    if (!res.ok) {
      throw new LlmError('RELAY_PROTOCOL_ERROR', `中转站返回 HTTP ${res.status}: ${raw.slice(0, 200)}`);
    }

    let data: any;
    try {
      data = JSON.parse(raw);
    } catch {
      throw new LlmError('RELAY_PROTOCOL_ERROR', `中转站返回非 JSON 内容: ${raw.slice(0, 200)}`);
    }

    return LlmClient.extractText(data, api);
  }

  public static extractStreamDelta(parsed: any, api: LlmApi | string): string {
    if (!parsed || typeof parsed !== 'object') return '';

    if (api === 'anthropic-messages') {
      if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
        return String(parsed.delta.text || '');
      }
      return '';
    }

    const choice = parsed.choices?.[0];
    const content = choice?.delta?.content ?? choice?.text ?? parsed.delta?.text ?? parsed.text;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('');
    }
    return '';
  }

  /**
   * 真正的流式传输 (SSE 流)：逐 token 实时回调 onDelta，并返回累计完整的最终文本
   */
  public async chatStream(
    messages: LlmMessage[],
    onDelta: (delta: string, accumulated: string) => void | Promise<void>,
    opts: { temperature?: number } = {}
  ): Promise<string> {
    const { baseUrl, apiKey, modelId } = this.config;
    if (!baseUrl || !apiKey || !modelId) {
      throw new LlmError('RELAY_NOT_CONFIGURED', '缺少中转站 baseUrl / apiKey / modelId');
    }

    const api = (this.config.api || 'openai-completions') as LlmApi;
    const url = baseUrl.replace(/\/+$/, '');
    const temperature = opts.temperature ?? this.config.temperature ?? 0.2;
    const timeoutMs = this.config.timeoutMs ?? 45000;

    let endpoint = `${url}/chat/completions`;
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      Accept: 'text/event-stream'
    };
    let body: Record<string, any> = {
      model: modelId,
      messages,
      temperature,
      stream: true
    };

    if (api === 'anthropic-messages') {
      endpoint = `${url}/messages`;
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        Accept: 'text/event-stream'
      };
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n');
      body = {
        model: modelId,
        max_tokens: 2048,
        temperature,
        stream: true,
        messages: messages
          .filter((m) => m.role !== 'system')
          .map((m) => ({ role: m.role, content: m.content })),
        ...(system ? { system } : {})
      };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        throw new LlmError('RELAY_TIMEOUT', `中转站流式请求超时 (${timeoutMs}ms)`);
      }
      throw new LlmError('RELAY_PROTOCOL_ERROR', `无法连接中转站流式接口: ${err?.message || err}`);
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new LlmError('RELAY_PROTOCOL_ERROR', `中转站返回 HTTP ${res.status}: ${errText.slice(0, 200)}`);
    }

    if (!res.body) {
      const full = await this.chat(messages, opts);
      if (full) await onDelta(full, full);
      return full;
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let accumulated = '';
    let sawSseData = false;

    const consumeDataPayload = async (dataStr: string) => {
      if (dataStr === '[DONE]') return true;
      try {
        const parsed = JSON.parse(dataStr);
        const tokenDelta = LlmClient.extractStreamDelta(parsed, api);
        if (tokenDelta) {
          accumulated += tokenDelta;
          await onDelta(tokenDelta, accumulated);
        }
      } catch {}
      return false;
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const rawLine of lines) {
          const line = rawLine.trim();
          if (!line || line.startsWith(':')) continue;

          if (line.startsWith('data:')) {
            sawSseData = true;
            const dataStr = line.slice(5).trim();
            const ended = await consumeDataPayload(dataStr);
            if (ended) {
              buffer = '';
              break;
            }
          }
        }
      }

      const leftover = buffer.trim();
      if (leftover) {
        if (leftover.startsWith('data:')) {
          await consumeDataPayload(leftover.slice(5).trim());
        } else if (!sawSseData && leftover.startsWith('{')) {
          try {
            const parsed = JSON.parse(leftover);
            const full = LlmClient.extractText(parsed, api);
            if (full && !accumulated) {
              accumulated = full;
              await onDelta(full, accumulated);
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!accumulated) {
      const full = await this.chat(messages, opts);
      if (full) await onDelta(full, full);
      return full;
    }

    return accumulated;
  }

  public static extractText(data: any, api: LlmApi): string {
    if (api === 'anthropic-messages') {
      const blocks = Array.isArray(data?.content) ? data.content : [];
      const text = blocks
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('\n');
      if (text) return text;
      throw new LlmError('RELAY_PROTOCOL_ERROR', `无法解析 Anthropic 响应: ${JSON.stringify(data).slice(0, 200)}`);
    }

    if (api === 'openai-responses') {
      if (typeof data?.output_text === 'string' && data.output_text) return data.output_text;
      const out = Array.isArray(data?.output) ? data.output : [];
      const text = out
        .flatMap((o: any) => (Array.isArray(o?.content) ? o.content : []))
        .filter((c: any) => typeof c?.text === 'string')
        .map((c: any) => c.text)
        .join('\n');
      if (text) return text;
      throw new LlmError('RELAY_PROTOCOL_ERROR', `无法解析 Responses 响应: ${JSON.stringify(data).slice(0, 200)}`);
    }

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const text = content.map((c: any) => (typeof c === 'string' ? c : c?.text || '')).join('');
      if (text) return text;
    }
    throw new LlmError('RELAY_PROTOCOL_ERROR', `无法解析模型响应: ${JSON.stringify(data).slice(0, 200)}`);
  }

  /**
   * 从模型输出中稳健地提取第一个 JSON 对象
   */
  public static extractJson<T = any>(text: string): T | null {
    if (!text) return null;
    const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
    const start = cleaned.indexOf('{');
    if (start < 0) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < cleaned.length; i++) {
      const ch = cleaned[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (ch === '\\') escaped = true;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(cleaned.slice(start, i + 1)) as T;
          } catch {
            return null;
          }
        }
      }
    }
    return null;
  }
}
