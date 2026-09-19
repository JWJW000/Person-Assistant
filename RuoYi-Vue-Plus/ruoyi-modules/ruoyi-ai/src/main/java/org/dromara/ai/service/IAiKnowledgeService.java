package org.dromara.ai.service;

import org.dromara.ai.domain.entity.AiKnowledgeBase;
import org.dromara.ai.domain.entity.AiKnowledgeChunk;
import org.dromara.ai.domain.entity.AiKnowledgeDocument;
import org.dromara.common.core.domain.PageResult;
import org.dromara.common.mybatis.core.page.PageQuery;

import java.util.List;

/**
 * 知识库、文档切片与向量检索核心业务接口
 *
 * @author ruoyi
 */
public interface IAiKnowledgeService {

    /**
     * 分页查询知识库列表
     */
    PageResult<AiKnowledgeBase> selectBaseList(AiKnowledgeBase base, PageQuery pageQuery);

    /**
     * 获取全部可用知识库列表
     */
    List<AiKnowledgeBase> selectBaseListAll();

    /**
     * 根据 ID 获取知识库详情
     */
    AiKnowledgeBase selectBaseById(Long id);

    /**
     * 新增知识库
     */
    boolean insertBase(AiKnowledgeBase base);

    /**
     * 更新知识库
     */
    boolean updateBase(AiKnowledgeBase base);

    /**
     * 删除知识库（级联清理切片与文档）
     */
    boolean deleteBaseById(Long id);

    /**
     * 分页查询指定知识库下的文档列表
     */
    PageResult<AiKnowledgeDocument> selectDocumentList(Long kbId, PageQuery pageQuery);

    /**
     * 获取文档详情
     */
    AiKnowledgeDocument selectDocumentById(Long id);

    /**
     * 删除文档（级联清理切片）
     */
    boolean deleteDocumentById(Long id);

    /**
     * 文本切片并执行 1536 维向量化入库
     *
     * @param kbId 知识库 ID
     * @param docId 可选关联文档 ID（为 null 时自动生成文本占位文档）
     * @param title 文档/切片标题
     * @param content 原始长文本
     * @param chunkSize 切片大小（默认 500）
     * @param chunkOverlap 重叠字数（默认 50）
     * @return 成功写入的切片数量
     */
    int chunkAndSaveText(Long kbId, Long docId, String title, String content, Integer chunkSize, Integer chunkOverlap);

    /**
     * 分页查询切片明细列表
     */
    PageResult<AiKnowledgeChunk> selectChunkList(Long kbId, Long docId, PageQuery pageQuery);

    /**
     * 单条删除切片
     */
    boolean deleteChunkById(Long id);

    /**
     * PostgreSQL pgvector 语义向量检索
     *
     * @param kbId 知识库 ID
     * @param query 用户检索关键词或提问
     * @param topK 返回最大结果数 (默认 5)
     * @param minScore 最低余弦相似度门槛 (例如 0.5)
     * @return 匹配的切片列表（携带相似度 score）
     */
    List<AiKnowledgeChunk> searchChunks(Long kbId, String query, Integer topK, Double minScore);
}
