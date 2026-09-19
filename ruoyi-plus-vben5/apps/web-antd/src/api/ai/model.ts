import { alovaInstance } from '#/utils/http';

export interface ModelConfig {
  id?: number;
  name: string;
  provider: string;
  modelType: string;
  modelName: string;
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  maxTokens?: number;
  dimensions?: number;
  isDefault?: string;
  status?: string;
  remark?: string;
  createTime?: string;
}

/**
 * 分页查询模型配置列表
 */
export function getModelConfigsApi(params?: any) {
  return alovaInstance.Get<any>('/ai/model/list', { params });
}

/**
 * 查询全部模型配置列表 (下拉选择)
 */
export function getAllModelConfigsApi(modelType?: string) {
  return alovaInstance.Get<ModelConfig[]>('/ai/model/all', {
    params: { modelType },
  });
}

/**
 * 获取模型配置详情
 */
export function getModelConfigApi(id: number) {
  return alovaInstance.Get<ModelConfig>(`/ai/model/${id}`);
}

/**
 * 新增模型配置
 */
export function createModelConfigApi(data: ModelConfig) {
  return alovaInstance.Post<any>('/ai/model', data);
}

/**
 * 修改模型配置
 */
export function updateModelConfigApi(data: ModelConfig) {
  return alovaInstance.Put<any>('/ai/model', data);
}

/**
 * 删除模型配置
 */
export function deleteModelConfigApi(id: number) {
  return alovaInstance.Delete<any>(`/ai/model/${id}`);
}

/**
 * 设置为默认模型
 */
export function setDefaultModelConfigApi(id: number) {
  return alovaInstance.Put<any>(`/ai/model/default/${id}`);
}
