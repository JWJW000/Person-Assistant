import { useAppStore } from '../store';

function handle401Unauthorized() {
  const store = useAppStore.getState();
  if (store.accessToken) {
    console.warn('Sa-Token 鉴权凭证已失效 (HTTP 401)，自动触发重新登录');
    store.setAccessToken(null);
  }
}
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

// 中转站 (https://newapi.5wjw.cn) 预置与保底可用模型列表 (27款主流模型)
export const DEFAULT_RELAY_MODELS: AiModelItem[] = [
  { id: 7, name: 'DeepSeek V4 Pro (旗舰推理)', modelName: 'deepseek-v4-pro', provider: 'deepseek', modelType: 'chat', isDefault: '1' },
  { id: 11, name: 'Claude Sonnet 4.6', modelName: 'claude-sonnet-4-6', provider: 'anthropic', modelType: 'chat', isDefault: '0' },
  { id: 12, name: 'Claude Opus 4.6 (深度思考)', modelName: 'claude-opus-4-6-thinking', provider: 'anthropic', modelType: 'chat', isDefault: '0' },
  { id: 13, name: 'Gemini 3.8 Flash High (顶配)', modelName: 'gemini-3.8-flash-high', provider: 'google', modelType: 'chat', isDefault: '0' },
  { id: 14, name: 'Gemini 3.7 Flash High', modelName: 'gemini-3.7-flash-high', provider: 'google', modelType: 'chat', isDefault: '0' },
  { id: 15, name: 'Gemini 3.6 Flash High', modelName: 'gemini-3.6-flash-high', provider: 'google', modelType: 'chat', isDefault: '0' },
  { id: 16, name: 'Gemini 3.5 Flash Lite', modelName: 'gemini-3.5-flash-lite', provider: 'google', modelType: 'chat', isDefault: '0' },
  { id: 17, name: 'Gemini 3.1 Pro Low', modelName: 'gemini-3.1-pro-low', provider: 'google', modelType: 'chat', isDefault: '0' },
  { id: 18, name: 'Gemini 3.1 Flash Lite', modelName: 'gemini-3.1-flash-lite', provider: 'google', modelType: 'chat', isDefault: '0' },
  { id: 19, name: 'Gemini 3 Flash', modelName: 'gemini-3-flash', provider: 'google', modelType: 'chat', isDefault: '0' },
  { id: 20, name: 'Gemini Pro Agent (智能体)', modelName: 'gemini-pro-agent', provider: 'google', modelType: 'chat', isDefault: '0' },
  { id: 8, name: 'DeepSeek V4 Flash (极速高并发)', modelName: 'deepseek-v4-flash', provider: 'deepseek', modelType: 'chat', isDefault: '0' },
  { id: 9, name: 'DeepSeek V4 Flash Vision (多模态)', modelName: 'deepseek-v4-flash-vision-exp', provider: 'deepseek', modelType: 'chat', isDefault: '0' },
  { id: 10, name: 'DeepSeek Flash', modelName: 'deepseek-flash', provider: 'deepseek', modelType: 'chat', isDefault: '0' },
  { id: 21, name: 'xAI Grok 4.6', modelName: 'grok-4.6', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 22, name: 'xAI Grok 4.5', modelName: 'grok-4.5', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 23, name: 'xAI Grok 4.3', modelName: 'grok-4.3', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 24, name: 'xAI Grok 4.20 (深度推理版)', modelName: 'grok-4.20-0309-reasoning', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 25, name: 'xAI Grok 4.20 (通用直出版)', modelName: 'grok-4.20-0309-non-reasoning', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 26, name: 'xAI Grok 4.20 Multi-Agent', modelName: 'grok-4.20-multi-agent-0309', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 27, name: 'xAI Grok 3 Mini', modelName: 'grok-3-mini', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 28, name: 'xAI Grok 3 Mini Fast', modelName: 'grok-3-mini-fast', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 29, name: 'xAI Grok Composer 2.5 Fast', modelName: 'grok-composer-2.5-fast', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 30, name: 'xAI Grok Build', modelName: 'grok-build-0.1', provider: 'xai', modelType: 'chat', isDefault: '0' },
  { id: 31, name: 'GPT OSS 120B Medium (开源巨兽)', modelName: 'gpt-oss-120b-medium', provider: 'openai', modelType: 'chat', isDefault: '0' },
  { id: 32, name: 'GPT-5.4 (储备模型)', modelName: 'gpt-5.4', provider: 'openai', modelType: 'chat', isDefault: '0' },
  { id: 33, name: 'GPT-5.5 (储备模型)', modelName: 'gpt-5.5', provider: 'openai', modelType: 'chat', isDefault: '0' },
];

export const DEFAULT_KNOWLEDGE_BASES: KnowledgeBaseItem[] = [
  {
    id: 4,
    name: '系统技术核心知识库',
    description: '企业知识与业务参考文档',
    chunkSize: 500,
    chunkOverlap: 50,
    isPublic: '1',
    embeddingModelId: 5,
  },
];

function getBaseUrl(serverUrl: string): string {
  const clean = serverUrl.replace(/\/$/, '');
  return clean.endsWith('/api') ? clean : `${clean}/api`;
}

function getHeaders(token?: string | null) {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    clientid: CLIENT_ID,
  };
  if (token) {
    h.Authorization = `Bearer ${token}`;
  }
  return h;
}

/**
 * 获取可用知识库列表 (自动降级至默认知识库，保证永远不为空)
 */
export async function fetchKnowledgeBases(serverUrl: string, token?: string | null): Promise<KnowledgeBaseItem[]> {
  try {
    const url = `${getBaseUrl(serverUrl)}/ai/knowledge/base/all`;
    const res = await fetch(url, {
      headers: getHeaders(token),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.code === 200 && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('获取知识库接口异常，采用保底列表:', err);
  }
  return DEFAULT_KNOWLEDGE_BASES;
}

/**
 * 获取中转站全部可用对话大模型列表 (自动保底，确保绝不出现 0 个模型)
 */
export async function fetchChatModels(serverUrl: string, token?: string | null): Promise<AiModelItem[]> {
  try {
    const url = `${getBaseUrl(serverUrl)}/ai/model/all?modelType=chat`;
    const res = await fetch(url, {
      headers: getHeaders(token),
    });
    if (res.ok) {
      const json = await res.json();
      if (json.code === 200 && Array.isArray(json.data) && json.data.length > 0) {
        return json.data;
      }
    }
  } catch (err) {
    console.warn('获取大模型接口异常，采用中转站保底模型列表:', err);
  }
  return DEFAULT_RELAY_MODELS;
}

/**
 * 设置服务端当前默认模型
 */
export async function setDefaultModel(serverUrl: string, token: string | null, modelId: number): Promise<boolean> {
  if (!token) return false;
  try {
    const url = `${getBaseUrl(serverUrl)}/ai/model/default/${modelId}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: getHeaders(token),
    });
    const json = await res.json();
    return json.code === 200;
  } catch {
    return false;
  }
}

/**
 * 获取会话列表
 */
export async function fetchAiSessions(serverUrl: string, token?: string | null): Promise<AiSessionItem[]> {
  if (!token) return [];
  try {
    const url = `${getBaseUrl(serverUrl)}/ai/chat/sessions`;
    const res = await fetch(url, {
      headers: getHeaders(token),
    });
    if (res.status === 401) {
      handle401Unauthorized();
      return [];
    }
    const json = await res.json();
    if (json.code === 401) {
      handle401Unauthorized();
      return [];
    }
    if (json.code === 200 && Array.isArray(json.data)) {
      return json.data;
    }
  } catch {}
  return [];
}

/**
 * 创建新会话
 */
export async function createAiSession(serverUrl: string, token: string | null, title?: string): Promise<AiSessionItem> {
  if (!token) {
    // 离线/临时会话
    return {
      id: `local-${Date.now()}`,
      title: title || '新对话',
    };
  }
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
export async function fetchAiMessages(serverUrl: string, token: string | null, sessionId: string): Promise<AiMessageItem[]> {
  if (!token || sessionId.startsWith('local-')) return [];
  try {
    const url = `${getBaseUrl(serverUrl)}/ai/chat/messages/${sessionId}`;
    const res = await fetch(url, {
      headers: getHeaders(token),
    });
    if (res.status === 401) {
      handle401Unauthorized();
      return [];
    }
    const json = await res.json();
    if (json.code === 401) {
      handle401Unauthorized();
      return [];
    }
    if (json.code === 200 && Array.isArray(json.data)) {
      return json.data;
    }
  } catch {}
  return [];
}

/**
 * 删除会话
 */
export async function deleteAiSession(serverUrl: string, token: string | null, sessionId: string): Promise<boolean> {
  if (!token || sessionId.startsWith('local-')) return true;
  try {
    const url = `${getBaseUrl(serverUrl)}/ai/chat/session/${sessionId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    const json = await res.json();
    return json.code === 200;
  } catch {
    return false;
  }
}

export interface StreamChatOptions {
  serverUrl: string;
  token?: string | null;
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

export interface KnowledgeChunkItem {
  id: number;
  kbId: number;
  docId?: number;
  chunkOrder: number;
  content: string;
  tokenCount: number;
  chunkType?: string;
  question?: string;
  createTime?: string;
}

/**
 * 分页查询切片明细列表
 */
export async function fetchKnowledgeChunks(
  serverUrl: string,
  token: string | null,
  kbId: number,
  pageNum = 1,
  pageSize = 50
): Promise<{ rows: KnowledgeChunkItem[]; total: number }> {
  if (!token) return { rows: [], total: 0 };
  try {
    const url = `${getBaseUrl(serverUrl)}/ai/knowledge/chunks/${kbId}?pageNum=${pageNum}&pageSize=${pageSize}`;
    const res = await fetch(url, {
      headers: getHeaders(token),
    });
    const json = await res.json();
    if (json.code === 200 && json.data) {
      return {
        rows: json.data.rows || [],
        total: json.data.total || 0,
      };
    }
  } catch (err) {
    console.warn('获取切片列表异常:', err);
  }
  return { rows: [], total: 0 };
}

/**
 * 文本或文档内容切片并执行 1536 维向量入库 (pgvector)
 */
export async function chunkTextAndSave(
  serverUrl: string,
  token: string | null,
  params: {
    kbId: number;
    title: string;
    content: string;
    chunkSize?: number;
    chunkOverlap?: number;
    chunkType?: string;
    question?: string;
  }
): Promise<{ chunkCount: number }> {
  if (!token) {
    throw new Error('请先登录后再进行知识库切片入库');
  }
  const url = `${getBaseUrl(serverUrl)}/ai/knowledge/chunk/text`;
  const res = await fetch(url, {
    method: 'POST',
    headers: getHeaders(token),
    body: JSON.stringify(params),
  });
  const json = await res.json();
  if (json.code === 200 && json.data) {
    return json.data;
  }
  throw new Error(json.msg || '切片入库失败');
}

/**
 * 删除单个切片
 */
export async function deleteKnowledgeChunk(
  serverUrl: string,
  token: string | null,
  chunkId: number
): Promise<boolean> {
  if (!token) return false;
  try {
    const url = `${getBaseUrl(serverUrl)}/ai/knowledge/chunk/${chunkId}`;
    const res = await fetch(url, {
      method: 'DELETE',
      headers: getHeaders(token),
    });
    const json = await res.json();
    return json.code === 200;
  } catch {
    return false;
  }
}
