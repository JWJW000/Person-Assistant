export type RunStreamEvent = {
  v?: number;
  runId?: string;
  seq?: number;
  type: string;
  occurredAt?: string;
  payload?: any;
};

/**
 * 解析 SSE 字节流。named event 的 data 本身就是完整 JSON envelope。
 */
export async function readSseStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: RunStreamEvent) => void,
  signal?: AbortSignal
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const onAbort = () => {
    try {
      reader.cancel();
    } catch {}
  };
  signal?.addEventListener('abort', onAbort);

  try {
    while (true) {
      if (signal?.aborted) break;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      const chunks = buffer.split('\n\n');
      buffer = chunks.pop() || '';
      for (const chunk of chunks) {
        const event = parseSseChunk(chunk);
        if (event) onEvent(event);
      }
    }
    const tail = parseSseChunk(buffer);
    if (tail) onEvent(tail);
  } finally {
    signal?.removeEventListener('abort', onAbort);
    try {
      reader.releaseLock();
    } catch {}
  }
}

export function parseSseChunk(chunk: string): RunStreamEvent | null {
  if (!chunk.trim()) return null;
  const dataLines: string[] = [];
  for (const rawLine of chunk.split('\n')) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (!dataLines.length) return null;
  try {
    const parsed = JSON.parse(dataLines.join('\n'));
    if (parsed && typeof parsed === 'object' && typeof parsed.type === 'string') {
      return parsed as RunStreamEvent;
    }
  } catch {}
  return null;
}
