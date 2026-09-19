import { alovaInstance } from '#/utils/http';

export interface AiChatSession {
  id: string;
  userId?: number;
  assistantId?: number;
  title: string;
  isPinned?: string;
  lastMessagePreview?: string;
  messageCount?: number;
  status?: string;
  createTime?: string;
  updateTime?: string;
}

export interface AiChatMessage {
  id?: number;
  sessionId: string;
  userId?: number;
  role: 'user' | 'assistant' | 'system' | string;
  content: string;
  citations?: any;
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  responseTimeMs?: number;
  status?: string;
  errorMsg?: string;
  createTime?: string;
}

/**
 * 分页查询后台会话管理列表
 */
export function getSessionListApi(params?: any) {
  return alovaInstance.Get<any>('/ai/chat/session/list', { params });
}

/**
 * 获取当前用户的全部会话列表 (前台对话用)
 */
export function getSessionsApi() {
  return alovaInstance.Get<AiChatSession[]>('/ai/chat/sessions');
}

/**
 * 新建会话
 */
export function createSessionApi(params?: { title?: string; assistantId?: number }) {
  return alovaInstance.Post<any>('/ai/chat/session/create', params || {});
}

/**
 * 删除会话
 */
export function deleteSessionApi(sessionId: string) {
  return alovaInstance.Delete<boolean>(`/ai/chat/session/${sessionId}`);
}

/**
 * 分页查询后台消息审计列表
 */
export function getMessageListApi(params?: any) {
  return alovaInstance.Get<any>('/ai/chat/message/list', { params });
}

/**
 * 获取特定会话的全部消息记录
 */
export function getMessagesApi(sessionId: string) {
  return alovaInstance.Get<AiChatMessage[]>(`/ai/chat/messages/${sessionId}`);
}

/**
 * 删除单条消息记录
 */
export function deleteMessageApi(id: number) {
  return alovaInstance.Delete<boolean>(`/ai/chat/message/${id}`);
}
