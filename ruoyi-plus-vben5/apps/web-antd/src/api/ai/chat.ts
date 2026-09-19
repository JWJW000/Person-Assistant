import { alovaInstance } from '#/utils/http';

/**
 * 获取会话列表
 */
export function getSessionsApi() {
  return alovaInstance.Get<any[]>('/ai/chat/sessions');
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
 * 获取会话消息详情列表
 */
export function getMessagesApi(sessionId: string) {
  return alovaInstance.Get<any[]>(`/ai/chat/messages/${sessionId}`);
}
