import { alovaInstance } from '#/utils/http';

export interface KnowledgeBase {
  id?: number;
  name: string;
  avatar?: string;
  description?: string;
  embeddingModelId?: number;
  isPublic?: string;
  chunkSize?: number;
  chunkOverlap?: number;
  status?: string;
  createTime?: string;
}

export interface KnowledgeDocument {
  id?: number;
  kbId: number;
  fileName: string;
  filePath?: string;
  fileSize?: number;
  fileType?: string;
  parseStatus?: string;
  chunkCount?: number;
  errorMsg?: string;
  createTime?: string;
}

export interface KnowledgeChunk {
  id?: number;
  kbId: number;
  docId: number;
  chunkOrder: number;
  chunkType?: 'qa' | 'text' | string;
  question?: string;
  content: string;
  tokenCount?: number;
  score?: number;
  status?: string;
  createTime?: string;
}

export interface ChunkTextParams {
  kbId: number;
  docId?: number;
  title?: string;
  content: string;
  chunkSize?: number;
  chunkOverlap?: number;
  chunkType?: 'qa' | 'text';
  question?: string;
}

export interface SearchChunkParams {
  kbId: number;
  query: string;
  topK?: number;
  minScore?: number;
}

/**
 * 分页查询知识库列表
 */
export function getKnowledgeBasesApi(params?: any) {
  return alovaInstance.Get<any>('/ai/knowledge/bases', { params });
}

/**
 * 获取所有知识库简要列表 (下拉选择)
 */
export function getAllKnowledgeBasesApi() {
  return alovaInstance.Get<KnowledgeBase[]>('/ai/knowledge/base/all');
}

/**
 * 获取知识库详情
 */
export function getKnowledgeBaseApi(id: number) {
  return alovaInstance.Get<KnowledgeBase>(`/ai/knowledge/base/${id}`);
}

/**
 * 新增知识库
 */
export function createKnowledgeBaseApi(data: KnowledgeBase) {
  return alovaInstance.Post<any>('/ai/knowledge/base', data);
}

/**
 * 修改知识库
 */
export function updateKnowledgeBaseApi(data: KnowledgeBase) {
  return alovaInstance.Put<any>('/ai/knowledge/base', data);
}

/**
 * 删除知识库
 */
export function deleteKnowledgeBaseApi(id: number) {
  return alovaInstance.Delete<any>(`/ai/knowledge/base/${id}`);
}

/**
 * 查询知识库文档列表
 */
export function getKnowledgeDocumentsApi(kbId: number, params?: any) {
  return alovaInstance.Get<any>(`/ai/knowledge/documents/${kbId}`, { params });
}

/**
 * 删除文档
 */
export function deleteKnowledgeDocumentApi(id: number) {
  return alovaInstance.Delete<any>(`/ai/knowledge/document/${id}`);
}

/**
 * 文本切片并向量化入库 (pgvector)
 */
export function chunkTextApi(data: ChunkTextParams) {
  return alovaInstance.Post<any>('/ai/knowledge/chunk/text', data);
}

/**
 * 分页查询切片明细列表
 */
export function getKnowledgeChunksApi(kbId: number, params?: any) {
  return alovaInstance.Get<any>(`/ai/knowledge/chunks/${kbId}`, { params });
}

/**
 * 删除切片
 */
export function deleteKnowledgeChunkApi(id: number) {
  return alovaInstance.Delete<any>(`/ai/knowledge/chunk/${id}`);
}

/**
 * pgvector 语义向量检索
 */
export function searchKnowledgeChunksApi(data: SearchChunkParams) {
  return alovaInstance.Post<KnowledgeChunk[]>('/ai/knowledge/search', data);
}

/**
 * 更新切片 / QA问答对词条并同步重新计算 pgvector 向量
 */
export function updateKnowledgeChunkApi(data: {
  id: number;
  content: string;
  question?: string;
  chunkType?: string;
}) {
  return alovaInstance.Put<any>('/ai/knowledge/chunk', data);
}
