import { alovaInstance } from '#/utils/http';

export interface AiPrompt {
  id?: number;
  title: string;
  act?: string;
  content: string;
  category?: string;
  variables?: string;
  isSystem?: string;
  status?: string;
  sortOrder?: number;
  remark?: string;
  createTime?: string;
  updateTime?: string;
}

/**
 * 分页查询提示词列表
 */
export function getPromptListApi(params?: any) {
  return alovaInstance.Get<any>('/ai/prompt/list', { params });
}

/**
 * 查询所有可用提示词列表 (前台/对话快速引用)
 */
export function getAllPromptsApi(category?: string) {
  return alovaInstance.Get<AiPrompt[]>('/ai/prompt/all', {
    params: { category },
  });
}

/**
 * 获取提示词详情
 */
export function getPromptApi(id: number) {
  return alovaInstance.Get<AiPrompt>(`/ai/prompt/${id}`);
}

/**
 * 新增提示词
 */
export function createPromptApi(data: AiPrompt) {
  return alovaInstance.Post<any>('/ai/prompt', data);
}

/**
 * 修改提示词
 */
export function updatePromptApi(data: AiPrompt) {
  return alovaInstance.Put<any>('/ai/prompt', data);
}

/**
 * 删除提示词
 */
export function deletePromptApi(id: number) {
  return alovaInstance.Delete<any>(`/ai/prompt/${id}`);
}

/**
 * 变更提示词状态
 */
export function changePromptStatusApi(id: number, status: string) {
  return alovaInstance.Put<any>('/ai/prompt/status', { id, status });
}
