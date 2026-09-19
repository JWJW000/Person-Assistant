import { CLIENT_ID } from './auth';
import { KnowledgeBaseItem, AiModelItem } from '../store';

export interface AiSessionItem {
  id: string;
  title: string;
  lastMessagePreview?: string;
  messageCount?: number;
  createTime?: string;
  updateTime?: string;
}

export interface AiMessageItem {
  id: number | string;
  sessionId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  status?: string;
  createTime?: string;
}

function getBaseUrl(serverUrl: string): string {
  const clean = serverUrl.replace(/\/$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

function getHeaders(token: string) {
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    clientid: CLIENT_ID,
  };
}

/**
 * 获取可用知识库列表 (供下拉选择)
 */
export async function fetchKnowledgeBases(serverUrl: string, token: string): Promise<KnowledgeBaseItem[]> {
  const url = `${getBaseUrl(serverUrl)}/ai/knowledge/base/all`;
  const res = await fetch(url, {
    headers: getHeaders(token),
  });
  const json = await res.json();
  if (json.code === 200 && Array.isArray(json.data)) {
    return json.data;
  }
  return [];
}

/**
 * 获取中转站全部可用对话大模型列表
 */
export async function fetchChatModels(serverUrl: string, token: string): Promise<AiModelItem[]> {
  const url = `${getBaseUrl(serverUrl)}/ai/model/all?modelType=chat`;
  const res = await fetch(url, {
    headers: getHeaders(token),
  });
  const json = await res.json();
  if (json.code === 200 && Array.isArray(json.data)) {
    return json.data;
  }
  return [];
}

/**
 * 设置服务端当前默认模型
 */
export async function setDefaultModel(serverUrl: string, token: string, modelId: number): Promise<boolean> {
  const url = `${getBaseUrl(serverUrl)}/ai/model/default/${modelId}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: getHeaders(token),
  });
  const json = await res.json();
  return json.code === 200;
}

/**
 * 获取会话列表
 */
export async function fetchAiSessions(serverUrl: string, token: string): Promise<AiSessionItem[]> {
  const url = `${getBaseUrl(serverUrl)}/ai/chat/sessions`;
  const res = await fetch(url, {
    headers: getHeaders(token),
  });
  const json = await res.json();
  if (json.code === 200 && Array.isArray(json.data)) {
    return json.data;
  }
  return [];
}

/**
 * 创建新会话
 */
export async function createAiSession(serverUrl: string, token: string, title?: string): Promise<AiSessionItem> {
  const url = `${getBaseUrl(serverUrl)}/ai/chat/session/create`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify({ title: title || '新对话' }),
  });
  const json = await res.json();
  if (json.code === 200 && json.data) {
    return json.data;
  }
  throw new Error(json.msg || '创建会话失败');
}

/**
 * 获取会话历史记录
 */
export async function fetchAiMessages(serverUrl: string, token: string, sessionId: string): Promise<AiMessageItem[]> {
  const url = `${getBaseUrl(serverUrl)}/ai/chat/messages/${sessionId}`;
  const res = await fetch(url, {
    headers: getHeaders(token),
  });
  const json = await res.json();
  if (json.code === 200 && Array.isArray(json.data)) {
    return json.data;
  }
  return [];
}

/**
 * 删除会话
 */
export async function deleteAiSession(serverUrl: string, token: string, sessionId: string): Promise<boolean> {
  const url = `${getBaseUrl(serverUrl)}/ai/chat/session/${sessionId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: getHeaders(token),
  });
  const json = await res.json();
  return json.code === 200;
}

export interface StreamChatOptions {
  serverUrl: string;
  token: string;
  sessionId: string;
  message: string;
  kbId?: number | null;
  modelId?: number | null;
  onChunk: (chunk: string) => void;
  onDone: () => void;
  onError: (err: any) => void;
  signal?: AbortSignal;
}

/**
 * 打字机流式对话 (支持中转站指定大模型与 RAG 知识库检索)
 */
export async function streamAiChat(options: StreamChatOptions): Promise<void> {
  const { serverUrl, token, sessionId, message, kbId, modelId, onChunk, onDone, onError, signal } = options;

  const url = `${getBaseUrl(serverUrl)}/ai/chat/stream`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: getHeaders(token),
      body: JSON.stringify({
        sessionId,
        message,
        kbId: kbId || undefined,
        modelId: modelId || undefined,
      }),
      signal,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`服务响应异常 (${res.status}): ${errText}`);
    }

    if (!res.body) {
      throw new Error('当前环境不支持流式响应');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        if (trimmed.startsWith('data:')) {
          const dataContent = trimmed.slice(5).trim();
          if (dataContent === '[DONE]') {
            onDone();
            return;
          }
          onChunk(dataContent);
        } else if (trimmed.startsWith('event:done') || trimmed.startsWith('event: done')) {
          onDone();
          return;
        }
      }
    }

    if (buffer.trim().startsWith('data:')) {
      const remaining = buffer.trim().slice(5).trim();
      if (remaining && remaining !== '[DONE]') {
        onChunk(remaining);
      }
    }

    onDone();
  } catch (err: any) {
    if (signal?.aborted) {
      onDone();
      return;
    }
    onError(err);
  }
}
